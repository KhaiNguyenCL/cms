import { query, queryOne } from '../../shared/database/db';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ContentDevice {
    id: string;
    name: string;
    status: string;
    storeId: string | null;
    storeName: string | null;
    scheduleName: string | null;
    playlistName: string | null;
    lastMediaTitle: string | null;
    lastPlayedAt: string | null;
    totalPlayedTodaySec: number;
}

export interface PlaybackLog {
    id: string;
    mediaId: string;
    mediaTitle: string;
    mediaType: string;
    playedAt: string;
    durationPlayed: number;
    completed: boolean;
}

// ─── Device list ──────────────────────────────────────────────────────────────

export async function getContentDevices(organizationId: string): Promise<ContentDevice[]> {
    return query<ContentDevice>(`
        SELECT
            d.id, d.name, d.status,
            d."storeId", st.name AS "storeName",
            -- Most recent schedule assignment (by sortOrder then assignedAt)
            (SELECT sc.name FROM schedule_assignments sa
             JOIN schedules sc ON sc.id = sa."scheduleId"
             WHERE sa."targetId" = d.id AND sa."targetType" = 'DEVICE'
               AND sa."organizationId" = d."organizationId"
             ORDER BY sa."sortOrder", sa."assignedAt" DESC LIMIT 1
            ) AS "scheduleName",
            (SELECT p.name FROM schedule_assignments sa
             JOIN schedules sc ON sc.id = sa."scheduleId"
             JOIN playlists p  ON p.id  = sc."playlistId"
             WHERE sa."targetId" = d.id AND sa."targetType" = 'DEVICE'
               AND sa."organizationId" = d."organizationId"
             ORDER BY sa."sortOrder", sa."assignedAt" DESC LIMIT 1
            ) AS "playlistName",
            -- Last media played
            (SELECT m.title FROM playback_logs pl
             JOIN media m ON m.id = pl."mediaId"
             WHERE pl."deviceId" = d.id
             ORDER BY pl."playedAt" DESC LIMIT 1
            ) AS "lastMediaTitle",
            (SELECT pl."playedAt" FROM playback_logs pl
             WHERE pl."deviceId" = d.id
             ORDER BY pl."playedAt" DESC LIMIT 1
            ) AS "lastPlayedAt",
            -- Total seconds played today
            COALESCE((
                SELECT SUM(pl."durationPlayed")
                FROM playback_logs pl
                WHERE pl."deviceId" = d.id
                  AND pl."playedAt" >= CURRENT_DATE
            ), 0)::int AS "totalPlayedTodaySec"
        FROM devices d
        LEFT JOIN stores st ON st.id = d."storeId"
        WHERE d."organizationId" = $1
        ORDER BY d.name
    `, [organizationId]);
}

// ─── Playback logs for one device ────────────────────────────────────────────

export async function getDevicePlaybackLogs(
    deviceId: string,
    organizationId: string,
    opts: { search?: string; dateFrom?: string; dateTo?: string; limit?: number; offset?: number }
): Promise<{ data: PlaybackLog[]; total: number }> {
    // Verify device belongs to org
    const dev = await queryOne<{ id: string }>(
        `SELECT id FROM devices WHERE id = $1 AND "organizationId" = $2`,
        [deviceId, organizationId]
    );
    if (!dev) return { data: [], total: 0 };

    const params: unknown[] = [deviceId];
    const where: string[] = [`pl."deviceId" = $1`];
    let i = 2;

    if (opts.search?.trim()) {
        where.push(`m.title ILIKE $${i++}`);
        params.push(`%${opts.search.trim()}%`);
    }
    if (opts.dateFrom) {
        where.push(`pl."playedAt" >= $${i++}`);
        params.push(opts.dateFrom);
    }
    if (opts.dateTo) {
        where.push(`pl."playedAt" <= $${i++}`);
        params.push(opts.dateTo);
    }

    const whereClause = where.join(' AND ');
    const limit  = Math.min(opts.limit  ?? 100, 500);
    const offset = opts.offset ?? 0;

    const [data, countRows] = await Promise.all([
        query<PlaybackLog>(`
            SELECT pl.id, pl."mediaId",
                   m.title AS "mediaTitle", m.type AS "mediaType",
                   pl."playedAt", pl."durationPlayed", pl.completed
            FROM playback_logs pl
            JOIN media m ON m.id = pl."mediaId"
            WHERE ${whereClause}
            ORDER BY pl."playedAt" DESC
            LIMIT ${limit} OFFSET ${offset}
        `, params),
        query<{ total: string }>(`
            SELECT COUNT(*) AS total
            FROM playback_logs pl
            JOIN media m ON m.id = pl."mediaId"
            WHERE ${whereClause}
        `, params),
    ]);

    return { data, total: parseInt(countRows[0]?.total ?? '0', 10) };
}
