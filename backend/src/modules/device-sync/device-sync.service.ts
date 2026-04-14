import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { query, queryOne } from '../../shared/database/db';
import { AppError } from '../../shared/middleware/error.middleware';
import config from '../../config';
import logger from '../../shared/utils/logger';
import redis, { RedisKeys } from '../../shared/cache/redis';
import type { JwtPayload } from '../../shared/middleware/auth.middleware';
import type { HeartbeatBody, PlaybackLogBody, BatchPlaybackLogBody, RegisterDeviceBody } from './device-sync.schema';
import { signMediaUrl } from '../media/media.signing';

// Per-device hash cache TTL. Staleness is controlled by org version comparison,
// not by expiry — so we keep keys alive for 1h to survive Redis restarts.
const CONTENT_HASH_CACHE_TTL = 3_600;

// Org license row is stable (changes only when admin acts) — cache 60s per device.
const ORG_LICENSE_CACHE_TTL = 60;

// Write device_health at most once every 5 minutes per device.
// Reduces INSERT rate from 1000/30s → 1000/300s (10× fewer writes).
const HEALTH_WRITE_INTERVAL_S = 300;

// ─── Global clock helpers ──────────────────────────────────────────────────────

/**
 * Calculate the UTC epoch (ms) for "today at startTime in the given timezone".
 * This is the anchor point all players use to compute elapsed time.
 *
 * Uses 2-iteration convergence so DST transitions are handled correctly:
 *  Iteration 1: removes the bulk of the timezone offset.
 *  Iteration 2: corrects any DST residual (always 0 after iter 1 for non-DST zones).
 */
function getScheduleStartEpochMs(startTime: string | null, timezone: string): number {
    const [h, m] = (startTime ?? '0:0').split(':').map(s => parseInt(s, 10) || 0);

    const now = new Date();
    // "YYYY-MM-DD" in the device timezone (en-CA locale gives ISO date format)
    const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(now);
    const [y, mo, d] = todayStr.split('-').map(Number);

    // Start with naive UTC guess: treat target wall-clock as if it were UTC
    let utcMs = Date.UTC(y, mo - 1, d, h, m, 0);

    // Two iterations converge for all real-world timezone offsets (including DST)
    for (let iter = 0; iter < 2; iter++) {
        const parts = new Intl.DateTimeFormat('en-US', {
            timeZone: timezone,
            year: 'numeric', month: 'numeric', day: 'numeric',
            hour: '2-digit', minute: '2-digit', second: '2-digit',
            hour12: false,
        }).formatToParts(new Date(utcMs));
        const p: Record<string, number> = {};
        parts.forEach(pt => { if (pt.type !== 'literal') p[pt.type] = parseInt(pt.value, 10); });
        // Desired: tz shows (y, mo, d, h, m, 0) — correct by the difference
        utcMs += Date.UTC(y, mo - 1, d, h, m, 0)
               - Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second);
    }

    return utcMs;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface DeviceRow {
    id: string;
    organizationId: string;
    name: string;
    pairingCode: string | null;
    androidId: string | null;
    model: string | null;
    osVersion: string | null;
    appVersion: string | null;
    status: string;
    isLicensed: boolean;
    lastSeen: string | null;
    location: string | null;
    timezone: string | null;
    settings: Record<string, unknown>;
}

// (org-level license removed — license is now per-device via licenseExpiresAt)

// ─── Content Hash ─────────────────────────────────────────────────────────────
// Tính SHA-256 từ toàn bộ nội dung active của thiết bị (schedules + playlists + media).
// Hash này được dùng để device biết khi nào cần gọi /sync.
//
// Cấu trúc hash input (mỗi row nối bằng '|'):
//   {scheduleId}:{scheduleUpdatedAt}:{priority}:{playlistId}:{playlistUpdatedAt}
//   :{mediaId}:{fileHash}:{position}:{durationOverride}
//
// Kết quả được cache Redis (CONTENT_HASH_CACHE_TTL giây) để tránh query DB
// trên mỗi heartbeat. Cache bị invalidate khi admin thay đổi schedule/playlist/media.

// ─── Schedule lookup via Schedule Assignments ─────────────────────────────────
// Device plays schedules directly assigned via schedule_assignments table.
// Priority: device-assigned schedules (1000+) > site-assigned schedules (500+).
// Deduplication: site schedules that are also device-assigned are excluded.

interface ScheduleHashRow {
    scheduleId: string;
    scheduleUpdatedAt: string;
    programPosition: number;
    source: string;       // 'DEVICE' | 'SITE'
    playlistId: string;
    playlistUpdatedAt: string;
    mediaId: string | null;
    fileHash: string | null;
    itemPosition: number | null;
    durationOverride: number | null;
    transition: string | null;
    transitionDuration: number | null;
}

type ScheduleRow = {
    id: string; name: string; playlistId: string; playlistName: string | null;
    startTime: string | null; endTime: string | null; daysOfWeek: number[];
    updatedAt: string;
};

function buildTimeFilter(tzParam: string) {
    return `
        s."isActive" = true
        AND s."startDate"::date <= (NOW() AT TIME ZONE ${tzParam})::date
        AND (s."endDate" IS NULL OR s."endDate"::date >= (NOW() AT TIME ZONE ${tzParam})::date)
        AND (
            array_length(s."daysOfWeek", 1) IS NULL
            OR EXTRACT(DOW FROM NOW() AT TIME ZONE ${tzParam})::int = ANY(s."daysOfWeek")
        )
        AND (s."startTime" IS NULL OR TO_CHAR(NOW() AT TIME ZONE ${tzParam}, 'HH24:MI') >= s."startTime")
        AND (s."endTime"   IS NULL OR TO_CHAR(NOW() AT TIME ZONE ${tzParam}, 'HH24:MI') <  s."endTime")
    `;
}

async function getSchedulesForDevice(deviceId: string, organizationId: string, timezone: string) {
    const tf = buildTimeFilter('$2');

    const deviceSchedules = await query<ScheduleRow>(
        `SELECT s.id, s.name, s."playlistId", p.name AS "playlistName",
                s."startTime", s."endTime", s."daysOfWeek", s."updatedAt"
         FROM schedule_assignments sa
         JOIN schedules s ON s.id = sa."scheduleId"
         LEFT JOIN playlists p ON p.id = s."playlistId"
         WHERE sa."organizationId" = $1
           AND sa."targetType" = 'DEVICE' AND sa."targetId" = $3
           AND ${tf}
         ORDER BY sa."sortOrder" ASC, sa."assignedAt" ASC`,
        [organizationId, timezone, deviceId],
    );

    const deviceScheduleIds = new Set(deviceSchedules.map(r => r.id));

    const siteRow = await queryOne<{ storeId: string | null }>(
        `SELECT "storeId" FROM devices WHERE id = $1`, [deviceId],
    );
    const siteId = siteRow?.storeId ?? null;

    let siteSchedules: ScheduleRow[] = [];
    if (siteId) {
        const allSite = await query<ScheduleRow>(
            `SELECT s.id, s.name, s."playlistId", p.name AS "playlistName",
                    s."startTime", s."endTime", s."daysOfWeek", s."updatedAt"
             FROM schedule_assignments sa
             JOIN schedules s ON s.id = sa."scheduleId"
             LEFT JOIN playlists p ON p.id = s."playlistId"
             WHERE sa."organizationId" = $1
               AND sa."targetType" = 'SITE' AND sa."targetId" = $3
               AND ${tf}
             ORDER BY sa."sortOrder" ASC, sa."assignedAt" ASC`,
            [organizationId, timezone, siteId],
        );
        siteSchedules = allSite.filter(r => !deviceScheduleIds.has(r.id));
    }

    return [
        ...deviceSchedules.map((s, i) => ({ ...s, priority: 1000 - i, source: 'DEVICE' as const })),
        ...siteSchedules.map((s, i)    => ({ ...s, priority: 500  - i, source: 'SITE'   as const })),
    ];
}

async function computeDeviceContentHash(deviceId: string, organizationId: string): Promise<string> {
    const device = await queryOne<{ timezone: string | null; siteTimezone: string | null }>(
        `SELECT d.timezone, s.timezone AS "siteTimezone"
         FROM devices d
         LEFT JOIN stores s ON s.id = d."storeId"
         WHERE d.id = $1 AND d."organizationId" = $2`,
        [deviceId, organizationId]
    );
    const timezone = device?.timezone ?? device?.siteTimezone ?? 'Asia/Bangkok';

    const tf = buildTimeFilter('$3');

    const rows = await query<ScheduleHashRow>(
        `SELECT
             s.id               AS "scheduleId",
             s."updatedAt"      AS "scheduleUpdatedAt",
             0                  AS "programPosition",
             'DEVICE'           AS source,
             p.id               AS "playlistId",
             p."updatedAt"      AS "playlistUpdatedAt",
             m.id               AS "mediaId",
             m."fileHash",
             pi.position        AS "itemPosition",
             pi."durationOverride",
             pi.transition, pi."transitionDuration"
         FROM schedule_assignments sa
         JOIN schedules s ON s.id = sa."scheduleId"
         JOIN playlists p ON p.id = s."playlistId"
         LEFT JOIN playlist_items pi ON pi."playlistId" = p.id
         LEFT JOIN media m ON m.id = pi."mediaId" AND m.status = 'READY'
         WHERE sa."organizationId" = $1
           AND sa."targetType" = 'DEVICE' AND sa."targetId" = $2
           AND ${tf}

         UNION ALL

         SELECT
             s.id               AS "scheduleId",
             s."updatedAt"      AS "scheduleUpdatedAt",
             0                  AS "programPosition",
             'SITE'             AS source,
             p.id               AS "playlistId",
             p."updatedAt"      AS "playlistUpdatedAt",
             m.id               AS "mediaId",
             m."fileHash",
             pi.position        AS "itemPosition",
             pi."durationOverride",
             pi.transition, pi."transitionDuration"
         FROM devices d
         JOIN stores st ON st.id = d."storeId"
         JOIN schedule_assignments sa ON sa."targetType" = 'SITE' AND sa."targetId" = st.id
         JOIN schedules s ON s.id = sa."scheduleId"
           AND s.id NOT IN (
               SELECT sa2."scheduleId" FROM schedule_assignments sa2
               WHERE sa2."targetType" = 'DEVICE' AND sa2."targetId" = $2
           )
         JOIN playlists p ON p.id = s."playlistId"
         LEFT JOIN playlist_items pi ON pi."playlistId" = p.id
         LEFT JOIN media m ON m.id = pi."mediaId" AND m.status = 'READY'
         WHERE d.id = $2 AND sa."organizationId" = $1
           AND ${tf}

         ORDER BY source DESC, "programPosition" ASC, "itemPosition" ASC NULLS LAST`,
        [organizationId, deviceId, timezone]
    );

    const content = rows
        .map(r =>
            `${r.scheduleId}:${r.scheduleUpdatedAt}:${r.programPosition}:${r.source}` +
            `:${r.playlistId}:${r.playlistUpdatedAt}` +
            `:${r.mediaId ?? ''}:${r.fileHash ?? ''}:${r.itemPosition ?? ''}:${r.durationOverride ?? ''}:${r.transition ?? ''}:${r.transitionDuration ?? ''}`
        )
        .join('|');

    return crypto.createHash('sha256').update(content || 'empty').digest('hex');
}

/**
 * Thundering-herd-safe content hash lookup.
 *
 * Instead of DEL-ing all 1000 per-device keys when content changes (which
 * causes every device to miss cache on the next heartbeat burst and recompute
 * simultaneously), we use a single org-level version counter (INCR on change).
 *
 * Cache value format: "{orgVersion}:{sha256hash}"
 *   - orgVersion mismatch → stale → recompute lazily on this device's heartbeat
 *   - orgVersion matches  → fresh → return immediately
 *
 * Result: when admin changes content, devices recompute one-by-one as they
 * naturally heartbeat over the next 10-30 s, spreading DB load evenly.
 */
async function getCachedContentHash(deviceId: string, organizationId: string): Promise<string> {
    const orgVersionKey = RedisKeys.orgContentVersion(organizationId);
    const deviceHashKey = RedisKeys.deviceContentHash(deviceId);

    // One round-trip to fetch both values
    const [orgVersion, cached] = await redis.mget(orgVersionKey, deviceHashKey);
    const currentVersion = orgVersion ?? '0';

    if (cached) {
        const sep = cached.indexOf(':');
        if (sep !== -1 && cached.substring(0, sep) === currentVersion) {
            return cached.substring(sep + 1); // version matches — cache hit
        }
        // Version mismatch — fall through to recompute
    }

    const hash = await computeDeviceContentHash(deviceId, organizationId);
    await redis.setex(deviceHashKey, CONTENT_HASH_CACHE_TTL, `${currentVersion}:${hash}`);
    return hash;
}

/**
 * Org license info — cached per device for ORG_LICENSE_CACHE_TTL seconds.
 * Avoids a JOIN query on every heartbeat when nothing has changed.
 */
async function getCachedOrgLicense(deviceId: string, organizationId: string) {
    const key = RedisKeys.deviceLicenseCache(deviceId);
    const cached = await redis.get(key);
    if (cached) {
        try { return JSON.parse(cached) as { isLicensed: boolean; deviceAdminPin: string }; }
        catch { /* corrupt entry — fall through */ }
    }

    const row = await queryOne<{ isLicensed: boolean; deviceAdminPin: string }>(
        `SELECT o."deviceAdminPin", d."isLicensed"
         FROM organizations o
         JOIN devices d ON d.id = $1
         WHERE o.id = $2`,
        [deviceId, organizationId],
    );
    const result = {
        isLicensed:     row?.isLicensed     ?? true,
        deviceAdminPin: row?.deviceAdminPin ?? '0000',
    };
    await redis.setex(key, ORG_LICENSE_CACHE_TTL, JSON.stringify(result));
    return result;
}

// Gọi hàm này khi nội dung của một org thay đổi để buộc recompute hash.
// Áp dụng cho TẤT CẢ devices trong org (khi schedule/playlist/media thay đổi).
/**
 * 'CONTENT' — media files may have changed: device must call /sync AND re-enqueue downloads + prune cache.
 * 'META'    — only ordering / timing / labels changed: device calls /sync to refresh playlist order,
 *             but no new files to download and no cache pruning needed.
 */
export type ContentUpdateType = 'CONTENT' | 'META';

export async function invalidateContentHashForOrg(
    organizationId: string,
    updateType: ContentUpdateType = 'CONTENT',
): Promise<void> {
    // Increment org-level version counter (single key, O(1)).
    // Per-device hash caches detect staleness on next heartbeat via version comparison,
    // so recomputation is spread naturally over the heartbeat window — no thundering herd.
    await redis.incr(RedisKeys.orgContentVersion(organizationId));
    logger.debug('Content version incremented', { organizationId, updateType });

    // Push real-time update to all connected devices and admin dashboard clients
    try {
        const { broadcastContentUpdate } = await import('../../shared/socket/socket.server');
        broadcastContentUpdate(organizationId, 'content.update', { updateType });
    } catch {
        // Socket.IO not yet initialized (e.g., test environment) — fall through
    }
}

// ─── Content Manifest — list of media files the device must download ──────────
// Device calls this on boot and on "content.update" event to know what to fetch.

export async function getContentManifest(deviceId: string, organizationId: string) {
    const device = await queryOne<{ timezone: string | null; siteTimezone: string | null; storeId: string | null }>(
        `SELECT d.timezone, s.timezone AS "siteTimezone", d."storeId"
         FROM devices d
         LEFT JOIN stores s ON s.id = d."storeId"
         WHERE d.id = $1 AND d."organizationId" = $2`,
        [deviceId, organizationId],
    );
    const siteId = device?.storeId ?? null;

    const params: unknown[] = [organizationId, deviceId];
    let siteClause = '';
    if (siteId) { params.push(siteId); siteClause = `OR (sa."targetType" = 'SITE' AND sa."targetId" = $3)`; }

    const rows = await query<{
        mediaId: string; filePath: string; fileHash: string; fileSize: number; mimeType: string;
    }>(
        `SELECT DISTINCT m.id AS "mediaId", m."filePath", m."fileHash", m."fileSize", m."mimeType"
         FROM schedule_assignments sa
         JOIN schedules s ON s.id = sa."scheduleId" AND s."isActive" = true
         JOIN playlists p ON p.id = s."playlistId"
         JOIN playlist_items pi ON pi."playlistId" = p.id
         JOIN media m ON m.id = pi."mediaId" AND m.status = 'READY'
         WHERE sa."organizationId" = $1
           AND ((sa."targetType" = 'DEVICE' AND sa."targetId" = $2) ${siteClause})`,
        params,
    );

    return rows.map(r => ({
        mediaId:  r.mediaId,
        fileName: r.filePath.split('/').pop() ?? r.mediaId,
        fileUrl:  signMediaUrl(r.mediaId, 'file', 86400, false),
        fileHash: r.fileHash,
        fileSize: r.fileSize,
        mimeType: r.mimeType,
    }));
}

// ─── 1. Register device (first pairing via pairingCode) ──────────────────────

export async function registerDevice(data: RegisterDeviceBody): Promise<{
    token: string;
    deviceId: string;
    organizationId: string;
    name: string;
}> {
    // Find device by pairing code (must be OFFLINE = not yet claimed)
    const device = await queryOne<DeviceRow>(
        `SELECT * FROM devices WHERE "pairingCode" = $1`,
        [data.pairingCode.toUpperCase()]
    );
    if (!device) throw new AppError(404, 'Mã ghép cặp không hợp lệ');

    // Update device with androidId + device info
    await query(
        `UPDATE devices SET
            "androidId" = $1,
            model        = $2,
            "osVersion"  = $3,
            "appVersion" = $4,
            status       = 'ONLINE',
            "lastSeen"   = NOW(),
            "pairingCode" = NULL,
            "updatedAt"  = NOW()
         WHERE id = $5`,
        [data.androidId, data.model ?? null, data.osVersion ?? null, data.appVersion ?? null, device.id]
    );

    // Issue a device JWT (type: 'device', no role needed)
    const payload: Omit<JwtPayload, 'role'> & { role: string } = {
        userId: device.id,               // reuse userId slot for deviceId
        organizationId: device.organizationId,
        role: 'DEVICE',
        type: 'device',
    };
    const token = jwt.sign(payload, config.jwt.secret, {
        expiresIn: '365d',  // Long-lived device token
    });

    logger.info('Device registered', { deviceId: device.id, androidId: data.androidId });
    return { token, deviceId: device.id, organizationId: device.organizationId, name: device.name };
}

// ─── 1b. Browser token — for Tizen / browser players ─────────────────────────

export async function getBrowserToken(deviceId: string): Promise<{
    token: string; deviceId: string; organizationId: string; name: string;
}> {
    const device = await queryOne<{ id: string; organizationId: string; name: string; pairingCode: string | null }>(
        `SELECT id, "organizationId", name, "pairingCode" FROM devices WHERE id = $1`,
        [deviceId],
    );
    if (!device) throw new AppError(404, 'Device not found');
    // Only allow paired devices (pairingCode is NULL after pairing)
    if (device.pairingCode !== null) throw new AppError(403, 'Device not paired yet');

    const payload: Omit<JwtPayload, 'role'> & { role: string } = {
        userId: device.id,
        organizationId: device.organizationId,
        role: 'DEVICE',
        type: 'device',
    };
    const token = jwt.sign(payload, config.jwt.secret, { expiresIn: '365d' });
    return { token, deviceId: device.id, organizationId: device.organizationId, name: device.name };
}

// ─── 2. Heartbeat — update status + upsert device_health ─────────────────────

export async function heartbeat(deviceId: string, organizationId: string, data: HeartbeatBody, wanIp?: string | null): Promise<{
    deviceId: string;
    serverTime: string;
    syncRequired: boolean;
    licenseStatus: string;
    isLicensed: boolean;
    deviceAdminPin: string;
}> {
    // Update device lastSeen + status, fetch lastOfflineAt for auto-start log
    const newStatus = data.isScreenOn === false ? 'SLEEP' : 'ONLINE';

    const prevDevice = await queryOne<{ status: string; lastOfflineAt: string | null; appVersion: string | null }>(
        `SELECT status, "lastOfflineAt", "appVersion" FROM devices WHERE id = $1 AND "organizationId" = $2`,
        [deviceId, organizationId]
    );

    const updates: string[] = [`status = '${newStatus}'`, `"lastSeen" = NOW()`, `"updatedAt" = NOW()`];
    // Reset lastOnlineAt when device transitions to ONLINE from an offline/exit state
    const wasOffline = prevDevice?.status === 'OFFLINE' || prevDevice?.status === 'APP_EXIT';
    if (newStatus === 'ONLINE' && wasOffline) updates.push(`"lastOnlineAt" = NOW()`);

    const values: unknown[] = [];
    let idx = 1;
    if (data.appVersion) { updates.push(`"appVersion" = $${idx++}`); values.push(data.appVersion); }
    if (data.osVersion)  { updates.push(`"osVersion" = $${idx++}`);  values.push(data.osVersion); }
    if (data.model)      { updates.push(`model = $${idx++}`);        values.push(data.model); }
    values.push(deviceId, organizationId);

    await query(
        `UPDATE devices SET ${updates.join(', ')} WHERE id = $${idx++} AND "organizationId" = $${idx++}`,
        values
    );

    // Log appVersion change to software history
    if (data.appVersion && prevDevice && data.appVersion !== prevDevice.appVersion) {
        import('../software-history/software-history.service')
            .then(({ logVersionChange }) =>
                logVersionChange(deviceId, organizationId, prevDevice.appVersion, data.appVersion!, 'HEARTBEAT')
            ).catch(() => {});
    }

    // Auto-log when device comes back ONLINE/SLEEP after being OFFLINE/APP_EXIT (for auto-start tracking)
    if ((prevDevice?.status === 'OFFLINE' || prevDevice?.status === 'APP_EXIT') && prevDevice.lastOfflineAt) {
        const offlineDurationMs = Date.now() - new Date(prevDevice.lastOfflineAt).getTime();
        const mins = Math.round(offlineDurationMs / 60_000);
        const durationStr = mins >= 60
            ? `${Math.floor(mins / 60)}h${mins % 60 > 0 ? `${mins % 60}p` : ''}`
            : `${mins} phút`;
        const msg = `✅ Online trở lại sau ${durationStr} offline`;
        import('../devices/devices.service')
            .then(({ autoLogDeviceEvent }) => autoLogDeviceEvent(deviceId, organizationId, msg))
            .catch(() => {});
        // Log ONLINE event to status history
        import('../alarm/alarm.service')
            .then(({ logStatusEvent }) => logStatusEvent(deviceId, organizationId, 'ONLINE', 'NETWORK'))
            .catch(() => {});
    }

    // Insert device_health at most once per HEALTH_WRITE_INTERVAL_S (5 min).
    // At 1000 devices × 30s heartbeat, this reduces health writes 10× while
    // keeping enough granularity for monitoring dashboards.
    const healthThrottleKey = RedisKeys.deviceHealthThrottle(deviceId);
    const healthAlreadyWritten = await redis.get(healthThrottleKey);
    if (!healthAlreadyWritten) {
        await query(
            `INSERT INTO device_health (id, "deviceId", "cpuUsage", "memoryUsage", "storageTotal", "storageUsed",
                                        "networkType", "isOnline", "ipAddress", "macAddress", "heapMemory", "networkConnected",
                                        "processCpuPercent", "wanIp", "subnet", "ipProtocol", "reportedAt")
             VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, true, $7, $8, $9, $10, $11, $12, $13, $14, NOW())`,
            [
                deviceId,
                data.cpuUsage ?? null,
                data.memoryUsage ?? null,
                data.storageTotal ?? null,
                data.storageUsed ?? null,
                data.networkType ?? null,
                data.ipAddress ?? null,
                data.macAddress ?? null,
                data.heapMemory ?? null,
                data.networkConnected ?? null,
                data.processCpuPercent ?? null,
                wanIp ?? null,
                data.subnet ?? null,
                data.ipProtocol ?? null,
            ]
        );
        await redis.setex(healthThrottleKey, HEALTH_WRITE_INTERVAL_S, '1');
    }

    // So sánh content hash của device với hash server tính được.
    // - Nếu device chưa gửi hash (lần boot đầu): syncRequired = true
    // - Nếu hash khác nhau (content đã thay đổi): syncRequired = true
    // - Nếu giống nhau: syncRequired = false (không cần sync)
    const serverHash = await getCachedContentHash(deviceId, organizationId);
    const syncRequired = !data.currentContentHash || data.currentContentHash !== serverHash;

    // Get org license status + device PIN — served from Redis cache (60s TTL).
    const orgLicense = await getCachedOrgLicense(deviceId, organizationId);
    const isDeviceLicensed = orgLicense.isLicensed;
    const licenseStatus    = isDeviceLicensed ? 'ACTIVE' : 'LICENSE_REQUIRED';
    const deviceAdminPin   = orgLicense.deviceAdminPin;

    // Store download status / contentReady if device reported them
    if (data.downloadStatus !== undefined || data.contentReady !== undefined) {
        const fields: string[] = [];
        const vals: unknown[] = [];
        let fi = 1;
        if (data.downloadStatus !== undefined) { fields.push(`"downloadStatus" = $${fi++}`); vals.push(data.downloadStatus); }
        if (data.contentReady   !== undefined) { fields.push(`"contentReady"   = $${fi++}`); vals.push(data.contentReady); }
        vals.push(deviceId);
        await query(`UPDATE devices SET ${fields.join(', ')}, "updatedAt" = NOW() WHERE id = $${fi}`, vals);
    }

    logger.debug('Device heartbeat', { deviceId, syncRequired, licenseStatus });
    return {
        deviceId,
        serverTime: new Date().toISOString(),
        syncRequired,
        licenseStatus,
        isLicensed: isDeviceLicensed,
        deviceAdminPin,
    };
}

// ─── 3. Sync — return current schedule + playlist + media list ────────────────

export async function getDeviceSync(deviceId: string, organizationId: string) {
    // Get device info (including isLicensed, role) with site timezone for cascade
    const device = await queryOne<DeviceRow & { siteTimezone: string | null; role: string; storeId: string | null }>(
        `SELECT d.id, d.name, d."organizationId", d.settings, d.timezone, d."isLicensed",
                d.role, d."storeId",
                s.timezone AS "siteTimezone"
         FROM devices d
         LEFT JOIN stores s ON s.id = d."storeId"
         WHERE d.id = $1 AND d."organizationId" = $2`,
        [deviceId, organizationId]
    );
    if (!device) throw new AppError(404, 'Device không tồn tại');

    // Cascade: device.timezone → site.timezone → Asia/Bangkok
    const effectiveTimezone = device.timezone ?? device.siteTimezone ?? 'Asia/Bangkok';

    // Check device license
    if (!device.isLicensed) {
        return {
            deviceId,
            organizationId,
            serverTime: new Date().toISOString(),
            licenseStatus: 'LICENSE_REQUIRED',
            message: 'Thiết bị chưa được cấp phép. Liên hệ admin để kích hoạt.',
            schedules: [],
        };
    }

    // Get store sync state (if device belongs to a store)
    let syncGroup: {
        id: string; startEpoch: number | null; totalDurationMs: number | null;
        playlistId: string | null; playlist?: unknown;
    } | null = null;

    const sgRow = await queryOne<{
        id: string; startEpoch: string | null; totalDurationMs: number | null; playlistId: string | null;
    }>(
        `SELECT s.id, s."startEpoch", s."totalDurationMs", s."playlistId"
         FROM stores s
         JOIN devices d ON d."storeId" = s.id
         WHERE d.id = $1`,
        [deviceId],
    );

    if (sgRow) {
        syncGroup = {
            id: sgRow.id,
            startEpoch: sgRow.startEpoch ? Number(sgRow.startEpoch) : null,
            totalDurationMs: sgRow.totalDurationMs,
            playlistId: sgRow.playlistId,
        };
    }

    // Get schedules for this device via the program assignment system ONLY.
    // Devices play only what has been explicitly assigned through programs.
    const schedules = await getSchedulesForDevice(deviceId, organizationId, effectiveTimezone);

    // For each schedule, load playlist + items + signed media URLs
    const schedulesWithContent = await Promise.all(
        schedules.map(async (schedule) => {
            const items = await query<{
                id: string; position: number; durationOverride: number | null; transition: string | null; transitionDuration: number | null;
                mediaId: string; mediaTitle: string; mediaType: string; thumbnailPath: string | null;
                mimeType: string; duration: number | null; width: number | null; height: number | null;
            }>(
                `SELECT pi.id, pi.position, pi."durationOverride", pi.transition, pi."transitionDuration",
                        m.id as "mediaId", m.title as "mediaTitle", m.type as "mediaType",
                        m."thumbnailPath", m."mimeType",
                        m.duration, m.width, m.height
                 FROM playlist_items pi
                 JOIN media m ON m.id = pi."mediaId"
                 WHERE pi."playlistId" = $1 AND m.status = 'READY'
                 ORDER BY pi.position ASC`,
                [schedule.playlistId]
            );

            // Global clock anchor: all players compute elapsed = serverTime - startEpoch.
            // Using % totalDurationMs they always land on the same slide regardless of start time.
            // totalDurationMs includes each item's display duration PLUS the transition into the
            // next item, so the clock accounts for the gap while the CSS transition plays.
            const startEpoch = getScheduleStartEpochMs(schedule.startTime, effectiveTimezone);
            const DEFAULT_TRANS_MS = 800;
            const totalDurationMs = items.reduce((sum, item, idx) => {
                const dur = ((item.durationOverride != null && item.durationOverride > 0)
                    ? item.durationOverride
                    : (item.duration ?? 10)) * 1000;
                const nextItem = items[(idx + 1) % items.length];
                const trans = nextItem.transitionDuration ?? DEFAULT_TRANS_MS;
                return sum + dur + trans;
            }, 0);

            return {
                scheduleId: schedule.id,
                scheduleName: schedule.name,
                priority: schedule.priority,
                startTime: schedule.startTime,
                endTime: schedule.endTime,
                daysOfWeek: schedule.daysOfWeek,
                startEpoch,
                totalDurationMs,
                playlist: {
                    id: schedule.playlistId,
                    name: schedule.playlistName,
                    items: items.map(item => ({
                        id: item.id,
                        position: item.position,
                        durationOverride: item.durationOverride,
                        transition: item.transition,
                        transitionDuration: item.transitionDuration,
                        mediaId: item.mediaId,
                        mediaTitle: item.mediaTitle,
                        mediaType: item.mediaType,
                        mimeType: item.mimeType,
                        duration: item.duration,
                        width: item.width,
                        height: item.height,
                        // Signed relative URLs — WebView resolves against its origin (server host:port)
                        // Using relative URLs avoids localhost:3000 being wrong on the TV device
                        // TTL 24h: gives Android enough time to download large files (up to 500MB) in background
                        mediaUrl: signMediaUrl(item.mediaId, 'file', 86400, false),
                        thumbnailUrl: item.thumbnailPath ? signMediaUrl(item.mediaId, 'thumbnail', 86400, false) : null,
                    })),
                },
            };
        })
    );

    // Tính content hash và cache lại — device sẽ gửi hash này trong heartbeat tiếp theo.
    // Dùng computeDeviceContentHash trực tiếp (bỏ qua cache cũ) để đảm bảo hash khớp với payload vừa trả về.
    const contentHash = await computeDeviceContentHash(deviceId, organizationId);
    await redis.setex(RedisKeys.deviceContentHash(deviceId), CONTENT_HASH_CACHE_TTL, contentHash);

    // Log playlist sync history (deduplication: only when playlist changes)
    const topSchedule = schedules[0] ?? null;
    import('../content-history/content-history.service')
        .then(({ logPlaylistSync }) =>
            logPlaylistSync(
                deviceId, organizationId,
                topSchedule?.playlistId ?? null,
                topSchedule?.playlistName ?? null,
                topSchedule?.name ?? null,
            )
        ).catch(() => {});

    // If sync group is actively playing, load its playlist items for the device
    if (syncGroup?.startEpoch && syncGroup.playlistId) {
        const sgItems = await query<{
            id: string; position: number; durationOverride: number | null; transition: string | null; transitionDuration: number | null;
            mediaId: string; mediaTitle: string; mediaType: string;
            mimeType: string; duration: number | null; width: number | null; height: number | null;
        }>(
            `SELECT pi.id, pi.position, pi."durationOverride", pi.transition, pi."transitionDuration",
                    m.id AS "mediaId", m.title AS "mediaTitle", m.type AS "mediaType",
                    m."mimeType", m.duration, m.width, m.height
             FROM playlist_items pi
             JOIN media m ON m.id = pi."mediaId"
             WHERE pi."playlistId" = $1 AND m.status = 'READY'
             ORDER BY pi.position ASC`,
            [syncGroup.playlistId],
        );
        // Recompute totalDurationMs from live items — must include transitionDuration
        // to match calculateSyncPosition() in the frontend (which accumulates dur + trans).
        // Using the stale DB value would cause position drift when playlist changes after Start.
        const DEFAULT_TRANS_MS = 800;
        const computedTotal = sgItems.reduce((sum, item, idx) => {
            const dur = (item.durationOverride ?? item.duration ?? 10) * 1000;
            const nextItem = sgItems[(idx + 1) % sgItems.length];
            const trans = nextItem.transitionDuration ?? DEFAULT_TRANS_MS;
            return sum + dur + trans;
        }, 0);
        if (computedTotal > 0) syncGroup.totalDurationMs = computedTotal;

        syncGroup.playlist = {
            id: syncGroup.playlistId,
            items: sgItems.map(item => ({
                ...item,
                mediaUrl: signMediaUrl(item.mediaId, 'file', 86400, false),
                thumbnailUrl: null,
            })),
        };
    }

    return {
        deviceId,
        organizationId,
        serverTime: new Date().toISOString(),
        timezone: effectiveTimezone,
        settings: device.settings ?? {},
        contentHash,
        schedules: schedulesWithContent,
        syncGroup: syncGroup ?? undefined,
    };
}

// ─── 4. Log single playback event ─────────────────────────────────────────────

export async function logPlayback(
    deviceId: string,
    organizationId: string,
    data: PlaybackLogBody
): Promise<{ logId: string }> {
    // Verify media belongs to org
    const media = await queryOne<{ id: string }>(
        `SELECT id FROM media WHERE id = $1 AND "organizationId" = $2`,
        [data.mediaId, organizationId]
    );
    if (!media) throw new AppError(404, 'Media không tồn tại');

    const rows = await query<{ id: string }>(
        `INSERT INTO playback_logs (id, "deviceId", "mediaId", "playedAt", "durationPlayed", completed)
         VALUES (gen_random_uuid()::text, $1, $2, $3::timestamp, $4, $5)
         RETURNING id`,
        [deviceId, data.mediaId, data.playedAt, data.durationPlayed, data.completed]
    );

    logger.debug('Playback logged', { deviceId, mediaId: data.mediaId, completed: data.completed });
    return { logId: rows[0].id };
}

// ─── 5. Playlist session log ──────────────────────────────────────────────────

export async function logPlaylistSession(
    deviceId: string,
    data: { playlistId: string; startedAt: string; completed: boolean }
): Promise<void> {
    await query(
        `INSERT INTO playlist_play_logs (id, "deviceId", "playlistId", "startedAt", "completedAt", completed)
         VALUES (gen_random_uuid()::text, $1, $2, $3::timestamp, $4, $5)`,
        [deviceId, data.playlistId, data.startedAt, data.completed ? new Date().toISOString() : null, data.completed]
    );
    logger.debug('Playlist session logged', { deviceId, playlistId: data.playlistId, completed: data.completed });
}

// ─── 6. Batch playback logs (offline => online catchup) ───────────────────────

export async function batchLogPlayback(
    deviceId: string,
    organizationId: string,
    data: BatchPlaybackLogBody
): Promise<{ inserted: number }> {
    // Verify device belongs to org
    const device = await queryOne<{ id: string }>(
        `SELECT id FROM devices WHERE id = $1 AND "organizationId" = $2`,
        [deviceId, organizationId]
    );
    if (!device) throw new AppError(403, 'Thiết bị không thuộc tổ chức này');

    // Get all unique mediaIds from the batch and verify they belong to org
    const mediaIds = [...new Set(data.logs.map(l => l.mediaId))];
    const validMedia = await query<{ id: string }>(
        `SELECT id FROM media WHERE id = ANY($1::text[]) AND "organizationId" = $2`,
        [mediaIds, organizationId]
    );
    const validIds = new Set(validMedia.map(m => m.id));

    // Insert all valid logs
    const validLogs = data.logs.filter(l => validIds.has(l.mediaId));
    for (const log of validLogs) {
        await query(
            `INSERT INTO playback_logs (id, "deviceId", "mediaId", "playedAt", "durationPlayed", completed)
             VALUES (gen_random_uuid()::text, $1, $2, $3::timestamp, $4, $5)
             ON CONFLICT DO NOTHING`,
            [deviceId, log.mediaId, log.playedAt, log.durationPlayed, log.completed]
        );
    }

    logger.info('Batch playback logs inserted', { deviceId, count: validLogs.length });
    return { inserted: validLogs.length };
}

// ─── 6. Mark device offline (called on clean shutdown) ────────────────────────

export async function markDeviceOffline(
    deviceId: string,
    organizationId: string,
    status: 'OFFLINE' | 'APP_EXIT' = 'OFFLINE'
): Promise<void> {
    await query(
        `UPDATE devices SET status = $1, "lastOfflineAt" = NOW(), "updatedAt" = NOW()
         WHERE id = $2 AND "organizationId" = $3`,
        [status, deviceId, organizationId]
    );
    // Insert final health record marking offline
    await query(
        `INSERT INTO device_health (id, "deviceId", "cpuUsage", "memoryUsage", "storageTotal", "storageUsed", "networkType", "isOnline", "reportedAt")
         VALUES (gen_random_uuid()::text, $1, NULL, NULL, NULL, NULL, NULL, false, NOW())`,
        [deviceId]
    );
    // Log OFFLINE event + send alert email
    const reason = status === 'APP_EXIT' ? 'SOFTWARE' : 'NETWORK';
    import('../alarm/alarm.service')
        .then(async ({ logStatusEvent, sendOfflineAlert }) => {
            await logStatusEvent(deviceId, organizationId, status, reason);
            const dev = await queryOne<{
                name: string;
                siteName: string | null;
                timeOn: string | null;
                timeOff: string | null;
                alarmToleranceMin: number | null;
                timezone: string | null;
            }>(
                `SELECT d.name,
                        s.name            AS "siteName",
                        s."timeOn",
                        s."timeOff",
                        s."alarmToleranceMin",
                        COALESCE(s.timezone, d.timezone) AS timezone
                 FROM devices d
                 LEFT JOIN stores s ON s.id = d."storeId"
                 WHERE d.id = $1`, [deviceId]
            );
            if (dev) {
                // Legacy alarm emails (alarm_emails table)
                sendOfflineAlert(organizationId, dev.name, reason, new Date().toISOString())
                    .catch(() => {});

                // New template-based mail — only during operating window
                const { isWithinOperatingWindow } = await import('../../shared/mail/mail.sender');
                const toleranceMin = dev.alarmToleranceMin ?? 60;
                const shouldNotify = isWithinOperatingWindow(
                    dev.timeOn, dev.timeOff, toleranceMin, dev.timezone
                );

                if (shouldNotify) {
                    const offlineAt = new Date().toLocaleString('vi-VN');
                    // Read triggerDelayMin from mail_settings
                    const { queryOne: qo } = await import('../../shared/database/db');
                    const ms = await qo<{ triggerDelayMin: number }>(
                        `SELECT "triggerDelayMin" FROM mail_settings WHERE "eventType" = 'DEVICE_OFFLINE'`
                    );
                    const delayMs = (ms?.triggerDelayMin ?? 5) * 60_000;
                    import('../../shared/jobs/queues')
                        .then(({ enqueueMailNotification }) => {
                            enqueueMailNotification({
                                eventType: 'DEVICE_OFFLINE',
                                orgId: organizationId,
                                deviceId,
                                vars: {
                                    deviceName: dev.name,
                                    siteName: dev.siteName ?? '',
                                    orgName: '',
                                    offlineAt,
                                    recipientName: '',
                                },
                            }, delayMs).catch(() => {});
                        })
                        .catch(() => {});
                } else {
                    logger.info('DEVICE_OFFLINE mail suppressed — outside operating window', {
                        deviceId, timeOn: dev.timeOn, timeOff: dev.timeOff, toleranceMin,
                    });
                }
            }
        })
        .catch(() => {});
    // In-app notification
    import('../../modules/notifications/notifications.service')
        .then(async ({ createNotification, NOTIF_TYPES }) => {
            const dev = await queryOne<{ name: string }>(`SELECT name FROM devices WHERE id = $1`, [deviceId]);
            await createNotification(
                organizationId,
                NOTIF_TYPES.DEVICE_OFFLINE,
                `Thiết bị offline: ${dev?.name ?? deviceId}`,
                status === 'APP_EXIT' ? 'Ứng dụng đã thoát' : 'Mất kết nối mạng',
                deviceId, 'device',
            );
        }).catch(() => {});
    logger.info('Device marked offline', { deviceId });
}
