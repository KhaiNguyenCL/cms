import { query, queryOne } from '../../shared/database/db';
import type { OverviewQuery, PlaybackStatsQuery, DeviceHealthQuery, TopContentQuery } from './analytics.schema';

// ─── Helper: build date-range WHERE clause ────────────────────────────────────

function buildDateRange(
    table: string,
    col: string,
    from?: string,
    to?: string,
    idx: number = 1
): { clause: string; values: unknown[]; nextIdx: number } {
    const conds: string[] = [];
    const values: unknown[] = [];
    if (from) { conds.push(`${table}.${col} >= $${idx++}::timestamp`); values.push(from); }
    if (to) { conds.push(`${table}.${col} <= ($${idx++}::timestamp + INTERVAL '1 day' - INTERVAL '1 second')`); values.push(to); }
    return { clause: conds.length ? conds.join(' AND ') : '', values, nextIdx: idx };
}

// ─── 1. Dashboard overview ────────────────────────────────────────────────────

export async function getDashboardOverview(organizationId: string, q: OverviewQuery) {
    const { from, to } = q;
    const dr = buildDateRange('pl', '"playedAt"', from, to, 2);

    // Run all counts in parallel
    const [
        deviceStats, userStats, mediaStats, playlistStats, scheduleStats,
        playbackTotal, playbackCompleted, storageUsed,
    ] = await Promise.all([
        // Devices: total + online
        queryOne<{ total: string; online: string }>(
            `SELECT COUNT(*) as total,
                    COUNT(*) FILTER (WHERE status = 'ONLINE') as online
             FROM devices WHERE "organizationId" = $1`,
            [organizationId]
        ),
        // Users: total + active
        queryOne<{ total: string; active: string }>(
            `SELECT COUNT(*) as total,
                    COUNT(*) FILTER (WHERE status = 'ACTIVE') as active
             FROM users WHERE "organizationId" = $1`,
            [organizationId]
        ),
        // Media: count + total size
        queryOne<{ count: string; totalSize: string }>(
            `SELECT COUNT(*) as count, COALESCE(SUM("fileSize"), 0)::bigint as "totalSize"
             FROM media WHERE "organizationId" = $1 AND status = 'READY'`,
            [organizationId]
        ),
        // Playlists
        queryOne<{ count: string }>(
            `SELECT COUNT(*) as count FROM playlists WHERE "organizationId" = $1`,
            [organizationId]
        ),
        // Schedules active
        queryOne<{ total: string; active: string }>(
            `SELECT COUNT(*) as total,
                    COUNT(*) FILTER (WHERE "isActive" = true) as active
             FROM schedules WHERE "organizationId" = $1`,
            [organizationId]
        ),
        // Playback count in period
        queryOne<{ count: string; totalMinutes: string }>(
            `SELECT COUNT(*) as count,
                    ROUND(COALESCE(SUM("durationPlayed"), 0) / 60.0, 2)::float as "totalMinutes"
             FROM playback_logs pl
             JOIN devices d ON d.id = pl."deviceId"
             WHERE d."organizationId" = $1${dr.clause ? ' AND ' + dr.clause : ''}`,
            [organizationId, ...dr.values]
        ),
        // Playback completed ratio
        queryOne<{ completed: string; total: string }>(
            `SELECT COUNT(*) FILTER (WHERE pl.completed = true) as completed,
                    COUNT(*) as total
             FROM playback_logs pl
             JOIN devices d ON d.id = pl."deviceId"
             WHERE d."organizationId" = $1${dr.clause ? ' AND ' + dr.clause : ''}`,
            [organizationId, ...dr.values]
        ),
        // Storage used by all devices
        queryOne<{ storageUsed: string; storageTotal: string }>(
            `SELECT COALESCE(SUM(dh."storageUsed"), 0)::bigint as "storageUsed",
                    COALESCE(SUM(dh."storageTotal"), 0)::bigint as "storageTotal"
             FROM device_health dh
             JOIN devices d ON d.id = dh."deviceId"
             WHERE d."organizationId" = $1`,
            [organizationId]
        ),
    ]);

    const totalPlays = parseInt(playbackTotal?.count ?? '0');
    const completedPl = parseInt(playbackCompleted?.completed ?? '0');
    const totalPlComp = parseInt(playbackCompleted?.total ?? '0');

    return {
        devices: {
            total: parseInt(deviceStats?.total ?? '0'),
            online: parseInt(deviceStats?.online ?? '0'),
        },
        users: {
            total: parseInt(userStats?.total ?? '0'),
            active: parseInt(userStats?.active ?? '0'),
        },
        media: {
            count: parseInt(mediaStats?.count ?? '0'),
            totalSizeBytes: parseInt(mediaStats?.totalSize ?? '0'),
        },
        playlists: {
            total: parseInt(playlistStats?.count ?? '0'),
        },
        schedules: {
            total: parseInt(scheduleStats?.total ?? '0'),
            active: parseInt(scheduleStats?.active ?? '0'),
        },
        playback: {
            totalPlays,
            totalMinutes: playbackTotal?.totalMinutes ?? 0,
            completionRate: totalPlComp > 0 ? Math.round((completedPl / totalPlComp) * 100) : 0,
        },
        storage: {
            usedBytes: parseInt(storageUsed?.storageUsed ?? '0'),
            totalBytes: parseInt(storageUsed?.storageTotal ?? '0'),
        },
    };
}

// ─── 2. Playback statistics over time ─────────────────────────────────────────

export async function getPlaybackStats(organizationId: string, q: PlaybackStatsQuery) {
    const { from, to, deviceId, mediaId, groupBy = 'day' } = q;
    const conditions: string[] = [`d."organizationId" = $1`];
    const values: unknown[] = [organizationId];
    let idx = 2;

    if (from) { conditions.push(`pl."playedAt" >= $${idx++}::timestamp`); values.push(from); }
    if (to) { conditions.push(`pl."playedAt" <= ($${idx++}::timestamp + INTERVAL '1 day' - INTERVAL '1 second')`); values.push(to); }
    if (deviceId) { conditions.push(`pl."deviceId" = $${idx++}`); values.push(deviceId); }
    if (mediaId) { conditions.push(`pl."mediaId" = $${idx++}`); values.push(mediaId); }

    const where = conditions.join(' AND ');

    const truncUnit = groupBy === 'month' ? 'month' : groupBy === 'week' ? 'week' : 'day';

    const rows = await query<{ period: string; plays: string; completed: string; totalMinutes: string }>(
        `SELECT DATE_TRUNC('${truncUnit}', pl."playedAt") as period,
                COUNT(*) as plays,
                COUNT(*) FILTER (WHERE pl.completed = true) as completed,
                ROUND(COALESCE(SUM(pl."durationPlayed"), 0) / 60.0, 2)::float as "totalMinutes"
         FROM playback_logs pl
         JOIN devices d ON d.id = pl."deviceId"
         WHERE ${where}
         GROUP BY period
         ORDER BY period ASC`,
        values
    );

    return rows.map(r => ({
        period: r.period,
        plays: parseInt(r.plays),
        completed: parseInt(r.completed),
        totalMinutes: r.totalMinutes,
    }));
}

// ─── 3. Top content by play count ─────────────────────────────────────────────

export async function getTopContent(organizationId: string, q: TopContentQuery) {
    const { from, to, limit = 10 } = q;
    const conditions: string[] = [`d."organizationId" = $1`];
    const values: unknown[] = [organizationId];
    let idx = 2;

    if (from) { conditions.push(`pl."playedAt" >= $${idx++}::timestamp`); values.push(from); }
    if (to) { conditions.push(`pl."playedAt" <= ($${idx++}::timestamp + INTERVAL '1 day' - INTERVAL '1 second')`); values.push(to); }

    const where = conditions.join(' AND ');

    return query<{
        mediaId: string; title: string; type: string;
        plays: string; completed: string; totalMinutes: string;
    }>(
        `SELECT pl."mediaId", m.title, m.type,
                COUNT(*) as plays,
                COUNT(*) FILTER (WHERE pl.completed = true) as completed,
                ROUND(COALESCE(SUM(pl."durationPlayed"), 0) / 60.0, 2)::float as "totalMinutes"
         FROM playback_logs pl
         JOIN devices d ON d.id = pl."deviceId"
         JOIN media m   ON m.id = pl."mediaId"
         WHERE ${where}
         GROUP BY pl."mediaId", m.title, m.type
         ORDER BY plays DESC
         LIMIT $${idx}`,
        [...values, limit]
    ).then(rows => rows.map(r => ({
        mediaId: r.mediaId,
        title: r.title,
        type: r.type,
        plays: parseInt(r.plays),
        completed: parseInt(r.completed),
        totalMinutes: r.totalMinutes,
    })));
}

// ─── 4. Device health summary ─────────────────────────────────────────────────

export async function getDeviceHealth(organizationId: string, q: DeviceHealthQuery) {
    const { deviceId, limit = 50 } = q;
    const conditions: string[] = [`d."organizationId" = $1`];
    const values: unknown[] = [organizationId];
    let idx = 2;

    if (deviceId) { conditions.push(`dh."deviceId" = $${idx++}`); values.push(deviceId); }

    const where = conditions.join(' AND ');

    // Get latest health record per device
    return query<{
        deviceId: string; deviceName: string; isOnline: boolean;
        cpuUsage: number; memoryUsage: number;
        storageUsed: string; storageTotal: string;
        storagePercent: number; networkType: string; reportedAt: string;
    }>(
        `SELECT DISTINCT ON (dh."deviceId")
             dh."deviceId", d.name as "deviceName",
             dh."isOnline", dh."cpuUsage", dh."memoryUsage",
             dh."storageUsed", dh."storageTotal",
             CASE WHEN dh."storageTotal" > 0
                  THEN ROUND((dh."storageUsed"::float / dh."storageTotal" * 100)::numeric, 1)::float
                  ELSE 0 END as "storagePercent",
             dh."networkType", dh."reportedAt"
         FROM device_health dh
         JOIN devices d ON d.id = dh."deviceId"
         WHERE ${where}
         ORDER BY dh."deviceId", dh."reportedAt" DESC
         LIMIT $${idx}`,
        [...values, limit]
    );
}

// ─── 5. Device activity summary (plays per device) ────────────────────────────

export async function getDeviceActivity(organizationId: string, q: { from?: string; to?: string; limit?: number }) {
    const { from, to, limit = 20 } = q;
    const conditions: string[] = [`d."organizationId" = $1`];
    const values: unknown[] = [organizationId];
    let idx = 2;

    if (from) { conditions.push(`pl."playedAt" >= $${idx++}::timestamp`); values.push(from); }
    if (to) { conditions.push(`pl."playedAt" <= ($${idx++}::timestamp + INTERVAL '1 day' - INTERVAL '1 second')`); values.push(to); }

    const where = conditions.join(' AND ');

    return query<{
        deviceId: string; deviceName: string; plays: string;
        totalMinutes: string; lastPlayedAt: string;
    }>(
        `SELECT pl."deviceId", d.name as "deviceName",
                COUNT(*) as plays,
                ROUND(COALESCE(SUM(pl."durationPlayed"), 0) / 60.0, 2)::float as "totalMinutes",
                MAX(pl."playedAt") as "lastPlayedAt"
         FROM playback_logs pl
         JOIN devices d ON d.id = pl."deviceId"
         WHERE ${where}
         GROUP BY pl."deviceId", d.name
         ORDER BY plays DESC
         LIMIT $${idx}`,
        [...values, limit]
    ).then(rows => rows.map(r => ({
        deviceId: r.deviceId,
        deviceName: r.deviceName,
        plays: parseInt(r.plays),
        totalMinutes: r.totalMinutes,
        lastPlayedAt: r.lastPlayedAt,
    })));
}
