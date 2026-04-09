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
    lastSyncedAt: string | null;
}

export interface ContentLog {
    id: string;
    playlistId: string | null;
    playlistName: string | null;
    scheduleName: string | null;
    syncedAt: string;
}

// ─── Device list ──────────────────────────────────────────────────────────────

export async function getContentDevices(organizationId: string): Promise<ContentDevice[]> {
    return query<ContentDevice>(`
        SELECT
            d.id, d.name, d.status,
            d."storeId", st.name AS "storeName",
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
            (SELECT dcl."syncedAt" FROM device_content_logs dcl
             WHERE dcl."deviceId" = d.id
             ORDER BY dcl."syncedAt" DESC LIMIT 1
            ) AS "lastSyncedAt"
        FROM devices d
        LEFT JOIN stores st ON st.id = d."storeId"
        WHERE d."organizationId" = $1
        ORDER BY d.name
    `, [organizationId]);
}

// ─── Playlist sync logs for one device ───────────────────────────────────────

export async function getDeviceContentLogs(
    deviceId: string,
    organizationId: string,
    opts: { dateFrom?: string; dateTo?: string; limit?: number; offset?: number }
): Promise<{ data: ContentLog[]; total: number }> {
    const dev = await queryOne<{ id: string }>(
        `SELECT id FROM devices WHERE id = $1 AND "organizationId" = $2`,
        [deviceId, organizationId]
    );
    if (!dev) return { data: [], total: 0 };

    const params: unknown[] = [deviceId];
    const where: string[] = [`"deviceId" = $1`];
    let i = 2;

    if (opts.dateFrom) { where.push(`"syncedAt" >= $${i++}`); params.push(opts.dateFrom); }
    if (opts.dateTo)   { where.push(`"syncedAt" <= $${i++}`); params.push(opts.dateTo + 'T23:59:59'); }

    const limit  = Math.min(opts.limit  ?? 200, 500);
    const offset = opts.offset ?? 0;
    const whereClause = where.join(' AND ');

    const [data, countRows] = await Promise.all([
        query<ContentLog>(`
            SELECT id, "playlistId", "playlistName", "scheduleName", "syncedAt"
            FROM device_content_logs
            WHERE ${whereClause}
            ORDER BY "syncedAt" DESC
            LIMIT ${limit} OFFSET ${offset}
        `, params),
        query<{ total: string }>(`
            SELECT COUNT(*) AS total FROM device_content_logs WHERE ${whereClause}
        `, params),
    ]);

    return { data, total: parseInt(countRows[0]?.total ?? '0', 10) };
}

// ─── Log playlist sync (called from device-sync.service) ─────────────────────
// Inserts a new entry only when the playlist changes (deduplication by playlistId).

export async function logPlaylistSync(
    deviceId: string,
    organizationId: string,
    playlistId: string | null,
    playlistName: string | null,
    scheduleName: string | null,
): Promise<void> {
    const last = await queryOne<{ playlistId: string | null }>(
        `SELECT "playlistId" FROM device_content_logs
         WHERE "deviceId" = $1
         ORDER BY "syncedAt" DESC LIMIT 1`,
        [deviceId]
    );

    // Only log when playlist actually changed
    if (last && last.playlistId === playlistId) return;

    await query(
        `INSERT INTO device_content_logs
           (id, "deviceId", "organizationId", "playlistId", "playlistName", "scheduleName", "syncedAt")
         VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, NOW())`,
        [deviceId, organizationId, playlistId, playlistName, scheduleName]
    );
}
