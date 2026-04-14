import { query, queryOne } from '../../shared/database/db';
import { randomBytes } from 'crypto';
import { AppError, handleUniqueViolation } from '../../shared/middleware/error.middleware';
import logger from '../../shared/utils/logger';
import type {
    ListDevicesQuery, UpdateDeviceBody,
    DeviceCommandBody, CreateGroupBody, UpdateGroupBody, CreateDeviceBody,
} from './devices.schema';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DeviceRow {
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
    licenseStartDate: string | null;  // ISO date
    licenseEndDate: string | null;    // ISO date
    lastSeen: string | null;
    lastOnlineAt: string | null;      // when device last transitioned to ONLINE
    lastOfflineAt: string | null;
    location: string | null;
    timezone: string;
    settings: Record<string, unknown> | null;
    role: string;
    downloadStatus: string;
    contentReady: boolean;
    createdAt: string;
    updatedAt: string;
    siteId: string | null;
    siteName: string | null;
}

export interface DeviceGroupRow {
    id: string;
    organizationId: string;
    name: string;
    description: string | null;
    deviceCount?: number;
    createdAt: string;
    updatedAt: string;
}

export interface PaginatedDevices {
    data: DeviceRow[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}

// ─── List devices ─────────────────────────────────────────────────────────────

export async function listDevices(
    organizationId: string,
    q: ListDevicesQuery,
    restrictToSiteId?: string | null
): Promise<PaginatedDevices> {
    const { page, limit, status, search } = q;
    const offset = (page - 1) * limit;

    const conditions: string[] = [`d."organizationId" = $1`];
    const values: unknown[] = [organizationId];
    let idx = 2;

    if (restrictToSiteId) { conditions.push(`d."storeId" = $${idx++}`); values.push(restrictToSiteId); }
    if (status) { conditions.push(`d.status = $${idx++}`); values.push(status); }
    if (search) { conditions.push(`d.name ILIKE $${idx++}`); values.push(`%${search}%`); }

    const where = conditions.join(' AND ');

    const [countRes, rows] = await Promise.all([
        queryOne<{ count: string }>(
            `SELECT COUNT(*) as count FROM devices d WHERE ${where}`, values
        ),
        query<DeviceRow>(
            `SELECT d.id, d."organizationId", d.name, d."pairingCode", d."androidId", d.model,
                    d."osVersion", d."appVersion", d.status, d."isLicensed",
                    d."licenseStartDate", d."licenseEndDate",
                    d."lastSeen", d."lastOnlineAt", d."lastOfflineAt",
                    d.location, d.timezone, d.settings,
                    d.role, d."downloadStatus", d."contentReady",
                    d."createdAt", d."updatedAt",
                    d."storeId" AS "siteId", s.name AS "siteName"
             FROM devices d
             LEFT JOIN stores s ON s.id = d."storeId"
             WHERE ${where}
             ORDER BY d."createdAt" DESC
             LIMIT $${idx++} OFFSET $${idx++}`,
            [...values, limit, offset]
        ),
    ]);

    const total = parseInt(countRes?.count ?? '0');
    return { data: rows, total, page, limit, totalPages: Math.ceil(total / limit) };
}

// ─── Get single device ────────────────────────────────────────────────────────

export async function getDeviceById(deviceId: string, organizationId: string, restrictToSiteId?: string | null): Promise<DeviceRow> {
    const conditions = [`id = $1`, `"organizationId" = $2`];
    const values: unknown[] = [deviceId, organizationId];
    if (restrictToSiteId) { conditions.push(`"storeId" = $3`); values.push(restrictToSiteId); }

    const device = await queryOne<DeviceRow>(
        `SELECT id, "organizationId", name, "pairingCode", "androidId", model, "osVersion", "appVersion",
                status, "isLicensed", "licenseStartDate", "licenseEndDate",
                "lastSeen", "lastOnlineAt", "lastOfflineAt",
                location, timezone, settings, "createdAt", "updatedAt"
         FROM devices
         WHERE ${conditions.join(' AND ')}`,
        values
    );
    if (!device) throw new AppError(404, 'Device không tồn tại');
    return device;
}

// ─── Create device ─────────────────────────────────────────────────────────────

export async function createDevice(
    organizationId: string,
    data: CreateDeviceBody
): Promise<DeviceRow> {
    // Generate a unique 6-digit numeric pairing code (easier to type on TV remote)
    let pairingCode: string;
    for (let attempts = 0; attempts < 10; attempts++) {
        pairingCode = String(Math.floor(100000 + Math.random() * 900000));
        const existing = await queryOne<{ id: string }>(
            `SELECT id FROM devices WHERE "pairingCode" = $1`,
            [pairingCode]
        );
        if (!existing) break;
    }

    let rows: DeviceRow[];
    try {
        rows = await query<DeviceRow>(
            `INSERT INTO devices (id, "organizationId", name, "pairingCode", status, "isLicensed", location, timezone, settings, "storeId", "createdAt", "updatedAt")
             VALUES (gen_random_uuid()::text, $1, $2, $3, 'OFFLINE', false, $4, $5, $6, $7, NOW(), NOW())
             RETURNING id, "organizationId", name, "pairingCode", "androidId", model, "osVersion", "appVersion",
                       status, "isLicensed", "licenseStartDate", "licenseEndDate",
                       "lastSeen", "lastOnlineAt", "lastOfflineAt",
                       location, timezone, settings, "createdAt", "updatedAt"`,
            [
                organizationId,
                data.name,
                pairingCode!,
                data.location ?? null,
                data.timezone ?? 'Asia/Ho_Chi_Minh',
                data.settings ? JSON.stringify(data.settings) : null,
                data.siteId ?? null,
            ]
        );
    } catch (err) {
        handleUniqueViolation(err, 'Tên thiết bị đã tồn tại trong tổ chức');
    }

    logger.info('Device created', { deviceId: rows![0].id, pairingCode: pairingCode! });
    return rows![0];
}

// ─── Update device ─────────────────────────────────────────────────────────────

export async function updateDevice(
    deviceId: string,
    organizationId: string,
    data: UpdateDeviceBody,
    restrictToSiteId?: string | null
): Promise<DeviceRow> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (data.name !== undefined)             { fields.push(`name = $${idx++}`);              values.push(data.name); }
    if (data.location !== undefined)         { fields.push(`location = $${idx++}`);          values.push(data.location); }
    if (data.timezone !== undefined)         { fields.push(`timezone = $${idx++}`);          values.push(data.timezone); }
    if (data.status !== undefined)           { fields.push(`status = $${idx++}`);            values.push(data.status); }
    if (data.settings !== undefined)         { fields.push(`settings = $${idx++}`);          values.push(JSON.stringify(data.settings)); }
    // licenseStartDate / licenseEndDate are managed by the license system, not editable here

    if (fields.length === 0) throw new AppError(400, 'Không có dữ liệu để cập nhật');

    fields.push(`"updatedAt" = NOW()`);
    values.push(deviceId, organizationId);

    let whereClause = `id = $${idx++} AND "organizationId" = $${idx++}`;
    if (restrictToSiteId) { whereClause += ` AND "storeId" = $${idx++}`; values.push(restrictToSiteId); }

    let rows: DeviceRow[];
    try {
        rows = await query<DeviceRow>(
            `UPDATE devices
             SET ${fields.join(', ')}
             WHERE ${whereClause}
             RETURNING id, "organizationId", name, "pairingCode", "androidId", model, "osVersion", "appVersion",
                       status, "isLicensed", "licenseStartDate", "licenseEndDate",
                       "lastSeen", "lastOnlineAt", "lastOfflineAt",
                       location, timezone, settings, "createdAt", "updatedAt"`,
            values
        );
    } catch (err) {
        handleUniqueViolation(err, 'Tên thiết bị đã tồn tại trong tổ chức');
    }
    if (!rows![0]) throw new AppError(404, 'Device không tồn tại');

    // Trigger mail notification when device status is set to ERROR
    if (data.status === 'ERROR') {
        const dev = rows[0];
        const errorAt = new Date().toLocaleString('vi-VN');
        queryOne<{ siteName: string | null }>(
            `SELECT s.name AS "siteName" FROM devices d LEFT JOIN stores s ON s.id = d."storeId" WHERE d.id = $1`,
            [deviceId]
        ).then(siteRow => {
            import('../../shared/jobs/queues')
                .then(({ enqueueMailNotification }) => {
                    enqueueMailNotification({
                        eventType: 'DEVICE_ERROR',
                        orgId: organizationId,
                        vars: {
                            deviceName: dev.name,
                            siteName: siteRow?.siteName ?? '',
                            orgName: '',
                            errorAt,
                            recipientName: '',
                        },
                    }).catch(() => {});
                })
                .catch(() => {});
        }).catch(() => {});
    }

    // In-app notification for ERROR status
    if (data.status === 'ERROR') {
        import('../../modules/notifications/notifications.service')
            .then(({ createNotification, NOTIF_TYPES }) =>
                createNotification(organizationId, NOTIF_TYPES.DEVICE_ERROR,
                    `Thiết bị lỗi: ${rows[0].name}`, 'Trạng thái thiết bị chuyển sang ERROR',
                    deviceId, 'device')
            ).catch(() => {});
    }

    logger.info('Device updated', { deviceId });
    return rows[0];
}

// ─── Delete device ─────────────────────────────────────────────────────────────

export async function deleteDevice(deviceId: string, organizationId: string): Promise<{ name: string }> {
    const result = await query<{ id: string; name: string }>(
        `DELETE FROM devices WHERE id = $1 AND "organizationId" = $2 RETURNING id, name`,
        [deviceId, organizationId]
    );
    if (!result[0]) throw new AppError(404, 'Device không tồn tại');

    // Blacklist token + push reset command so the TV returns to pairing screen
    const redis = (await import('../../shared/cache/redis')).default;
    const { RedisKeys } = await import('../../shared/cache/redis');
    await redis.setex(RedisKeys.deviceBlacklist(deviceId), 60 * 60 * 24 * 7, '1');

    try {
        const { pushCommandToDevice } = await import('../../shared/socket/socket.server');
        pushCommandToDevice(deviceId, 'command.reset_pairing' as any);
    } catch { /* device may be offline */ }

    logger.info('Device deleted', { deviceId });
    return { name: result[0].name };
}

// ─── Reset device (revoke token, clear pairing, back to OFFLINE) ──────────────

export async function resetDevice(deviceId: string, organizationId: string): Promise<{ pairingCode: string }> {
    const device = await queryOne<{ id: string }>(
        `SELECT id FROM devices WHERE id = $1 AND "organizationId" = $2`,
        [deviceId, organizationId]
    );
    if (!device) throw new AppError(404, 'Device không tồn tại');

    // Blacklist the device token in Redis so next API call returns 401
    const redis = (await import('../../shared/cache/redis')).default;
    const { RedisKeys } = await import('../../shared/cache/redis');
    await redis.setex(RedisKeys.deviceBlacklist(deviceId), 60 * 60 * 24 * 7, '1');

    // Generate a fresh unique 6-digit pairing code
    let pairingCode = '';
    for (let attempt = 0; attempt < 10; attempt++) {
        pairingCode = String(Math.floor(100000 + Math.random() * 900000));
        const taken = await queryOne<{ id: string }>(
            `SELECT id FROM devices WHERE "pairingCode" = $1`, [pairingCode]
        );
        if (!taken) break;
    }

    // Reset device state + store new pairing code immediately
    await query(
        `UPDATE devices SET
            "androidId" = NULL, "appVersion" = NULL, "osVersion" = NULL,
            "pairingCode" = $1, status = 'OFFLINE', "lastSeen" = NULL, "updatedAt" = NOW()
         WHERE id = $2`,
        [pairingCode, deviceId]
    );

    // Cache new code in Redis with TTL
    await redis.setex(RedisKeys.pairingCode(pairingCode), 300, deviceId);

    // Push reset command to device (if online) — triggers immediate re-pair screen
    try {
        const { pushCommandToDevice } = await import('../../shared/socket/socket.server');
        pushCommandToDevice(deviceId, 'command.reset_pairing' as any);
    } catch { /* socket not initialized */ }

    logger.info('Device reset — re-pairing required', { deviceId, pairingCode });
    return { pairingCode };
}

// ─── Send command ──────────────────────────────────────────────────────────────

export interface CommandResult {
    deviceId: string;
    command: string;
    status: 'QUEUED';
    message: string;
    queuedAt: string;
}

export async function sendDeviceCommand(
    deviceId: string,
    organizationId: string,
    data: DeviceCommandBody,
    restrictToSiteId?: string | null
): Promise<CommandResult> {
    // Verify device exists and belongs to org (and site if restricted)
    const siteClause = restrictToSiteId ? ` AND "storeId" = $3` : '';
    const siteValues = restrictToSiteId ? [deviceId, organizationId, restrictToSiteId] : [deviceId, organizationId];
    const device = await queryOne<{ id: string; status: string }>(
        `SELECT id, status FROM devices WHERE id = $1 AND "organizationId" = $2${siteClause}`,
        siteValues
    );
    if (!device) throw new AppError(404, 'Device không tồn tại');

    // Map REST command name → WebSocket event name
    const commandEventMap: Record<string, string> = {
        RESTART: 'command.restart',
        SCREENSHOT: 'command.screenshot',
        RELOAD_CONTENT: 'command.reload_content',
        SLEEP: 'command.sleep',
        WAKE_UP: 'command.wake_up',
        VIEWER_RESTART: 'command.viewer_restart',
        DOWNLOAD_CONTENT: 'command.download_content',
        SET_VOLUME: 'command.set_volume',
        EXIT_APP: 'command.exit_app',
    };
    const wsEvent = commandEventMap[data.command] ?? data.command.toLowerCase();

    // Try to push command via WebSocket (realtime)
    let deliveredRealtime = false;
    try {
        const { pushCommandToDevice } = await import('../../shared/socket/socket.server');
        deliveredRealtime = pushCommandToDevice(deviceId, wsEvent as any, data.payload);
    } catch {
        // Socket.IO not yet initialized (e.g., test environment) — fall through
    }

    logger.info('Device command sent', {
        deviceId,
        command: data.command,
        deliveredRealtime,
        payload: data.payload,
    });

    return {
        deviceId,
        command: data.command,
        status: 'QUEUED',
        message: deliveredRealtime
            ? `Lệnh ${data.command} đã được gửi ngay tới device qua WebSocket`
            : `Lệnh ${data.command} đã lưu vào hàng đợi (device chưa kết nối)`,
        queuedAt: new Date().toISOString(),
    };
}

// ─── Set device license ────────────────────────────────────────────────────────

export async function setDeviceLicense(
    deviceId: string,
    organizationId: string,
    isLicensed: boolean
): Promise<DeviceRow> {
    const rows = await query<DeviceRow>(
        `UPDATE devices
         SET "isLicensed" = $1, "updatedAt" = NOW()
         WHERE id = $2 AND "organizationId" = $3
         RETURNING id, "organizationId", name, "pairingCode", "androidId", model, "osVersion", "appVersion",
                   status, "isLicensed", "licenseStartDate", "licenseEndDate",
                   "lastSeen", "lastOnlineAt", "lastOfflineAt",
                   location, timezone, settings, "createdAt", "updatedAt"`,
        [isLicensed, deviceId, organizationId]
    );
    if (!rows[0]) throw new AppError(404, 'Device không tồn tại');
    logger.info('Device license updated', { deviceId, isLicensed });

    // Push license change to device immediately — no need to wait for heartbeat
    import('../../shared/socket/socket.server').then(({ getIO, deviceRoom }) => {
        try {
            getIO().of('/device').to(deviceRoom(deviceId)).emit('content.update', {
                reason: 'license_changed',
                timestamp: new Date().toISOString(),
            });
        } catch { /* socket not ready */ }
    }).catch(() => {});

    return rows[0];
}

// ─── Get device health (latest record) ────────────────────────────────────────

export interface DeviceHealthRow {
    cpuUsage: number | null;
    memoryUsage: number | null;
    storageTotal: number | null;
    storageUsed: number | null;
    networkType: string | null;
    ipAddress: string | null;
    macAddress: string | null;
    heapMemory: number | null;
    networkConnected: boolean | null;
    processCpuPercent: number | null;
    wanIp: string | null;
    reportedAt: string | null;
}

export async function getDeviceHealth(deviceId: string, organizationId: string): Promise<DeviceHealthRow | null> {
    const device = await queryOne<{ id: string }>(
        `SELECT id FROM devices WHERE id = $1 AND "organizationId" = $2`,
        [deviceId, organizationId]
    );
    if (!device) throw new AppError(404, 'Device không tồn tại');

    return queryOne<DeviceHealthRow>(
        `SELECT "cpuUsage", "memoryUsage", "storageTotal", "storageUsed", "networkType",
                "ipAddress", "macAddress", "heapMemory", "networkConnected",
                "processCpuPercent", "wanIp", "reportedAt"
         FROM device_health
         WHERE "deviceId" = $1 AND "isOnline" = true
         ORDER BY "reportedAt" DESC
         LIMIT 1`,
        [deviceId]
    );
}

// ─── Now Playing (latest playback log) ────────────────────────────────────────

export interface NowPlayingRow {
    mediaId: string;
    mediaTitle: string;
    mediaType: string;
    playedAt: string;
    durationPlayed: number;
    completed: boolean;
}

export async function getNowPlaying(deviceId: string, organizationId: string): Promise<NowPlayingRow | null> {
    const device = await queryOne<{ id: string }>(
        `SELECT id FROM devices WHERE id = $1 AND "organizationId" = $2`,
        [deviceId, organizationId]
    );
    if (!device) throw new AppError(404, 'Device không tồn tại');

    return queryOne<NowPlayingRow>(
        `SELECT pl.id AS "mediaId", m.title AS "mediaTitle", m.type AS "mediaType",
                pl."playedAt", pl."durationPlayed", pl.completed
         FROM playback_logs pl
         JOIN media m ON m.id = pl."mediaId"
         WHERE pl."deviceId" = $1
         ORDER BY pl."playedAt" DESC
         LIMIT 1`,
        [deviceId]
    );
}

// ─── Device Comments ───────────────────────────────────────────────────────────

export interface DeviceCommentRow {
    id: string;
    deviceId: string;
    userId: string | null;
    userName: string | null;
    comment: string;
    createdAt: string;
}

export async function getDeviceComments(deviceId: string, organizationId: string): Promise<DeviceCommentRow[]> {
    const device = await queryOne<{ id: string }>(
        `SELECT id FROM devices WHERE id = $1 AND "organizationId" = $2`,
        [deviceId, organizationId]
    );
    if (!device) throw new AppError(404, 'Device không tồn tại');

    return query<DeviceCommentRow>(
        `SELECT id, "deviceId", "userId", "userName", comment, "createdAt"
         FROM device_comments
         WHERE "deviceId" = $1 AND "organizationId" = $2
         ORDER BY "createdAt" DESC
         LIMIT 20`,
        [deviceId, organizationId]
    );
}

export async function addDeviceComment(
    deviceId: string,
    organizationId: string,
    userId: string,
    userName: string,
    comment: string
): Promise<DeviceCommentRow> {
    const rows = await query<DeviceCommentRow>(
        `INSERT INTO device_comments (id, "deviceId", "organizationId", "userId", "userName", comment, "createdAt")
         VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, NOW())
         RETURNING id, "deviceId", "userId", "userName", comment, "createdAt"`,
        [deviceId, organizationId, userId, userName, comment]
    );
    return rows[0];
}

/** Auto-log a system event to device_comments (no user, for audit trail). */
export async function autoLogDeviceEvent(deviceId: string, organizationId: string, message: string): Promise<void> {
    await query(
        `INSERT INTO device_comments (id, "deviceId", "organizationId", "userId", "userName", comment, "createdAt")
         VALUES (gen_random_uuid()::text, $1, $2, NULL, 'System', $3, NOW())`,
        [deviceId, organizationId, message]
    );
}

// ─── Device logs (mock) ────────────────────────────────────────────────────────

export async function getDeviceLogs(deviceId: string, organizationId: string) {
    const device = await queryOne<{ id: string }>(
        `SELECT id FROM devices WHERE id = $1 AND "organizationId" = $2`,
        [deviceId, organizationId]
    );
    if (!device) throw new AppError(404, 'Device không tồn tại');

    // TODO: implement proper log storage (Redis stream hoặc bảng device_logs)
    return {
        deviceId,
        logs: [],
        message: 'Log storage sẽ được implement qua WebSocket/Redis stream',
    };
}

// ─── Device Groups ─────────────────────────────────────────────────────────────

export async function listGroups(organizationId: string): Promise<DeviceGroupRow[]> {
    return query<DeviceGroupRow>(
        `SELECT g.id, g."organizationId", g.name, g.description,
                COUNT(d.id)::int as "deviceCount",
                g."createdAt", g."updatedAt"
         FROM device_groups g
         LEFT JOIN devices d ON d."organizationId" = g."organizationId"
              AND d.settings->>'groupId' = g.id
         WHERE g."organizationId" = $1
         GROUP BY g.id
         ORDER BY g.name`,
        [organizationId]
    );
}

export async function createGroup(
    organizationId: string,
    data: CreateGroupBody
): Promise<DeviceGroupRow> {
    const rows = await query<DeviceGroupRow>(
        `INSERT INTO device_groups (id, "organizationId", name, description, "createdAt", "updatedAt")
         VALUES (gen_random_uuid()::text, $1, $2, $3, NOW(), NOW())
         RETURNING id, "organizationId", name, description, "createdAt", "updatedAt"`,
        [organizationId, data.name, data.description ?? null]
    );

    // Assign devices to group via settings.groupId
    if (data.deviceIds && data.deviceIds.length > 0) {
        for (const devId of data.deviceIds) {
            await query(
                `UPDATE devices
                 SET settings = COALESCE(settings, '{}'::jsonb) || jsonb_build_object('groupId', $1),
                     "updatedAt" = NOW()
                 WHERE id = $2 AND "organizationId" = $3`,
                [rows[0].id, devId, organizationId]
            );
        }
    }

    logger.info('Device group created', { groupId: rows[0].id, organizationId });
    return { ...rows[0], deviceCount: data.deviceIds?.length ?? 0 };
}

export async function updateGroup(
    groupId: string,
    organizationId: string,
    data: UpdateGroupBody
): Promise<DeviceGroupRow> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (data.name !== undefined) { fields.push(`name = $${idx++}`); values.push(data.name); }
    if (data.description !== undefined) { fields.push(`description = $${idx++}`); values.push(data.description); }

    if (fields.length === 0 && !data.deviceIds) throw new AppError(400, 'Không có dữ liệu để cập nhật');

    let updatedGroup: DeviceGroupRow | null = null;

    if (fields.length > 0) {
        fields.push(`"updatedAt" = NOW()`);
        values.push(groupId, organizationId);
        const rows = await query<DeviceGroupRow>(
            `UPDATE device_groups
             SET ${fields.join(', ')}
             WHERE id = $${idx++} AND "organizationId" = $${idx++}
             RETURNING id, "organizationId", name, description, "createdAt", "updatedAt"`,
            values
        );
        if (!rows[0]) throw new AppError(404, 'Group không tồn tại');
        updatedGroup = rows[0];
    } else {
        updatedGroup = await queryOne<DeviceGroupRow>(
            `SELECT id, "organizationId", name, description, "createdAt", "updatedAt"
             FROM device_groups WHERE id = $1 AND "organizationId" = $2`,
            [groupId, organizationId]
        );
        if (!updatedGroup) throw new AppError(404, 'Group không tồn tại');
    }

    // Update device memberships if deviceIds provided
    if (data.deviceIds !== undefined) {
        // Remove all devices from this group first
        await query(
            `UPDATE devices
             SET settings = settings - 'groupId', "updatedAt" = NOW()
             WHERE "organizationId" = $1 AND settings->>'groupId' = $2`,
            [organizationId, groupId]
        );
        // Add new devices
        for (const devId of data.deviceIds) {
            await query(
                `UPDATE devices
                 SET settings = COALESCE(settings, '{}'::jsonb) || jsonb_build_object('groupId', $1),
                     "updatedAt" = NOW()
                 WHERE id = $2 AND "organizationId" = $3`,
                [groupId, devId, organizationId]
            );
        }
    }

    logger.info('Device group updated', { groupId });
    return updatedGroup!;
}


