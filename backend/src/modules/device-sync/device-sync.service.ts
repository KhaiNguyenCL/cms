import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { query, queryOne } from '../../shared/database/db';
import { AppError } from '../../shared/middleware/error.middleware';
import config from '../../config';
import logger from '../../shared/utils/logger';
import redis, { RedisKeys } from '../../shared/cache/redis';
import type { JwtPayload } from '../../shared/middleware/auth.middleware';
import type { HeartbeatBody, PlaybackLogBody, BatchPlaybackLogBody, RegisterDeviceBody } from './device-sync.schema';
import { getActiveSchedulesForDevice } from '../schedules/schedules.service';
import { signMediaUrl } from '../media/media.signing';

// TTL Redis cho content hash (giây). Worst-case: device chậm nhận content change tối đa TTL này.
const CONTENT_HASH_CACHE_TTL = 60;

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
    lastSeen: string | null;
    location: string | null;
    timezone: string | null;
    settings: Record<string, unknown>;
}

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

async function computeDeviceContentHash(deviceId: string, organizationId: string): Promise<string> {
    const device = await queryOne<{ settings: Record<string, unknown> }>(
        `SELECT settings FROM devices WHERE id = $1 AND "organizationId" = $2`,
        [deviceId, organizationId]
    );
    const groupId = (device?.settings as Record<string, unknown> | undefined)?.groupId ?? null;

    const rows = await query<{
        scheduleId: string;
        scheduleUpdatedAt: string;
        priority: number;
        playlistId: string;
        playlistUpdatedAt: string;
        mediaId: string | null;
        fileHash: string | null;
        position: number | null;
        durationOverride: number | null;
    }>(
        `SELECT
             s.id               AS "scheduleId",
             s."updatedAt"      AS "scheduleUpdatedAt",
             s.priority,
             p.id               AS "playlistId",
             p."updatedAt"      AS "playlistUpdatedAt",
             m.id               AS "mediaId",
             m."fileHash",
             pi.position,
             pi."durationOverride"
         FROM schedules s
         JOIN playlists p ON p.id = s."playlistId"
         LEFT JOIN playlist_items pi ON pi."playlistId" = p.id
         LEFT JOIN media m ON m.id = pi."mediaId" AND m.status = 'READY'
         WHERE s."organizationId" = $1
           AND s."isActive" = true
           AND s."startDate" <= NOW()
           AND (s."endDate" IS NULL OR s."endDate" >= NOW())
           AND (
               s."targetType" = 'ALL'
               OR (s."targetType" = 'DEVICE' AND s."targetDeviceId" = $2)
               OR (s."targetType" = 'GROUP'  AND s."targetGroupId"  = $3)
           )
         ORDER BY s.priority DESC, s.id, pi.position ASC NULLS LAST`,
        [organizationId, deviceId, groupId]
    );

    const content = rows
        .map(r =>
            `${r.scheduleId}:${r.scheduleUpdatedAt}:${r.priority}` +
            `:${r.playlistId}:${r.playlistUpdatedAt}` +
            `:${r.mediaId ?? ''}:${r.fileHash ?? ''}:${r.position ?? ''}:${r.durationOverride ?? ''}`
        )
        .join('|');

    return crypto.createHash('sha256').update(content || 'empty').digest('hex');
}

// Lấy content hash từ Redis cache, hoặc tính lại nếu cache miss rồi lưu vào cache.
async function getCachedContentHash(deviceId: string, organizationId: string): Promise<string> {
    const cacheKey = RedisKeys.deviceContentHash(deviceId);
    const cached = await redis.get(cacheKey);
    if (cached) return cached;

    const hash = await computeDeviceContentHash(deviceId, organizationId);
    await redis.setex(cacheKey, CONTENT_HASH_CACHE_TTL, hash);
    return hash;
}

// Gọi hàm này khi nội dung của một org thay đổi để buộc recompute hash.
// Áp dụng cho TẤT CẢ devices trong org (khi schedule/playlist/media thay đổi).
export async function invalidateContentHashForOrg(organizationId: string): Promise<void> {
    const devices = await query<{ id: string }>(
        `SELECT id FROM devices WHERE "organizationId" = $1`,
        [organizationId]
    );
    if (devices.length === 0) return;

    const pipeline = redis.pipeline();
    for (const d of devices) {
        pipeline.del(RedisKeys.deviceContentHash(d.id));
    }
    await pipeline.exec();
    logger.debug('Content hash cache invalidated', { organizationId, deviceCount: devices.length });

    // Push real-time update to all connected devices and admin dashboard clients
    try {
        const { broadcastContentUpdate } = await import('../../shared/socket/socket.server');
        broadcastContentUpdate(organizationId, 'content.update');
    } catch {
        // Socket.IO not yet initialized (e.g., test environment) — fall through
    }
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

// ─── 2. Heartbeat — update status + upsert device_health ─────────────────────

export async function heartbeat(deviceId: string, organizationId: string, data: HeartbeatBody): Promise<{
    deviceId: string;
    serverTime: string;
    syncRequired: boolean;
}> {
    // Update device lastSeen + status
    const updates: string[] = [`status = 'ONLINE'`, `"lastSeen" = NOW()`, `"updatedAt" = NOW()`];
    const values: unknown[] = [];
    let idx = 1;
    if (data.appVersion) { updates.push(`"appVersion" = $${idx++}`); values.push(data.appVersion); }
    if (data.osVersion) { updates.push(`"osVersion" = $${idx++}`); values.push(data.osVersion); }
    values.push(deviceId, organizationId);

    await query(
        `UPDATE devices SET ${updates.join(', ')} WHERE id = $${idx++} AND "organizationId" = $${idx++}`,
        values
    );

    // Upsert device_health (always insert latest record)
    if (data.cpuUsage !== undefined || data.memoryUsage !== undefined || data.storageTotal !== undefined) {
        await query(
            `INSERT INTO device_health (id, "deviceId", "cpuUsage", "memoryUsage", "storageTotal", "storageUsed", "networkType", "isOnline", "reportedAt")
             VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, true, NOW())`,
            [
                deviceId,
                data.cpuUsage ?? null,
                data.memoryUsage ?? null,
                data.storageTotal ?? null,
                data.storageUsed ?? null,
                data.networkType ?? null,
            ]
        );
    }

    // So sánh content hash của device với hash server tính được.
    // - Nếu device chưa gửi hash (lần boot đầu): syncRequired = true
    // - Nếu hash khác nhau (content đã thay đổi): syncRequired = true
    // - Nếu giống nhau: syncRequired = false (không cần sync)
    const serverHash = await getCachedContentHash(deviceId, organizationId);
    const syncRequired = !data.currentContentHash || data.currentContentHash !== serverHash;

    logger.debug('Device heartbeat', { deviceId, syncRequired });
    return { deviceId, serverTime: new Date().toISOString(), syncRequired };
}

// ─── 3. Sync — return current schedule + playlist + media list ────────────────

export async function getDeviceSync(deviceId: string, organizationId: string) {
    // Get device info
    const device = await queryOne<DeviceRow>(
        `SELECT id, name, "organizationId", settings, timezone FROM devices WHERE id = $1 AND "organizationId" = $2`,
        [deviceId, organizationId]
    );
    if (!device) throw new AppError(404, 'Device không tồn tại');

    // Get active schedules for this device (uses the getActiveSchedulesForDevice helper from schedules service)
    const schedules = await getActiveSchedulesForDevice(deviceId, organizationId);

    // For each schedule, load playlist + items + signed media URLs
    const schedulesWithContent = await Promise.all(
        schedules.map(async (schedule) => {
            const items = await query<{
                id: string; position: number; durationOverride: number | null; transition: string | null;
                mediaId: string; mediaTitle: string; mediaType: string; thumbnailPath: string | null;
                mimeType: string; duration: number | null; width: number | null; height: number | null;
            }>(
                `SELECT pi.id, pi.position, pi."durationOverride", pi.transition,
                        m.id as "mediaId", m.title as "mediaTitle", m.type as "mediaType",
                        m."thumbnailPath", m."mimeType",
                        m.duration, m.width, m.height
                 FROM playlist_items pi
                 JOIN media m ON m.id = pi."mediaId"
                 WHERE pi."playlistId" = $1 AND m.status = 'READY'
                 ORDER BY pi.position ASC`,
                [schedule.playlistId]
            );

            return {
                scheduleId: schedule.id,
                scheduleName: schedule.name,
                priority: schedule.priority,
                startTime: schedule.startTime,
                endTime: schedule.endTime,
                daysOfWeek: schedule.daysOfWeek,
                playlist: {
                    id: schedule.playlistId,
                    name: schedule.playlistName,
                    items: items.map(item => ({
                        id: item.id,
                        position: item.position,
                        durationOverride: item.durationOverride,
                        transition: item.transition,
                        mediaId: item.mediaId,
                        mediaTitle: item.mediaTitle,
                        mediaType: item.mediaType,
                        mimeType: item.mimeType,
                        duration: item.duration,
                        width: item.width,
                        height: item.height,
                        // Signed absolute URLs — Android device cần full URL để tải file
                        mediaUrl: signMediaUrl(item.mediaId, 'file', 3600, true),
                        thumbnailUrl: item.thumbnailPath ? signMediaUrl(item.mediaId, 'thumbnail', 3600, true) : null,
                    })),
                },
            };
        })
    );

    // Tính content hash và cache lại — device sẽ gửi hash này trong heartbeat tiếp theo.
    // Dùng computeDeviceContentHash trực tiếp (bỏ qua cache cũ) để đảm bảo hash khớp với payload vừa trả về.
    const contentHash = await computeDeviceContentHash(deviceId, organizationId);
    await redis.setex(RedisKeys.deviceContentHash(deviceId), CONTENT_HASH_CACHE_TTL, contentHash);

    return {
        deviceId,
        organizationId,
        serverTime: new Date().toISOString(),
        timezone: device.timezone ?? 'Asia/Ho_Chi_Minh',
        settings: device.settings ?? {},
        contentHash,
        schedules: schedulesWithContent,
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

// ─── 5. Batch playback logs (offline => online catchup) ───────────────────────

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

export async function markDeviceOffline(deviceId: string, organizationId: string): Promise<void> {
    await query(
        `UPDATE devices SET status = 'OFFLINE', "updatedAt" = NOW()
         WHERE id = $1 AND "organizationId" = $2`,
        [deviceId, organizationId]
    );
    // Insert final health record marking offline
    await query(
        `INSERT INTO device_health (id, "deviceId", "cpuUsage", "memoryUsage", "storageTotal", "storageUsed", "networkType", "isOnline", "reportedAt")
         VALUES (gen_random_uuid()::text, $1, NULL, NULL, NULL, NULL, NULL, false, NOW())`,
        [deviceId]
    );
    logger.info('Device marked offline', { deviceId });
}
