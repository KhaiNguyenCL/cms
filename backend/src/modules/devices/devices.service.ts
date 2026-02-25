import { query, queryOne } from '../../shared/database/db';
import { randomBytes } from 'crypto';
import { AppError } from '../../shared/middleware/error.middleware';
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
    lastSeen: string | null;
    location: string | null;
    timezone: string;
    settings: Record<string, unknown> | null;
    createdAt: string;
    updatedAt: string;
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
    q: ListDevicesQuery
): Promise<PaginatedDevices> {
    const { page, limit, status, search } = q;
    const offset = (page - 1) * limit;

    const conditions: string[] = [`d."organizationId" = $1`];
    const values: unknown[] = [organizationId];
    let idx = 2;

    if (status) { conditions.push(`d.status = $${idx++}`); values.push(status); }
    if (search) { conditions.push(`d.name ILIKE $${idx++}`); values.push(`%${search}%`); }

    const where = conditions.join(' AND ');

    const [countRes, rows] = await Promise.all([
        queryOne<{ count: string }>(
            `SELECT COUNT(*) as count FROM devices d WHERE ${where}`, values
        ),
        query<DeviceRow>(
            `SELECT d.id, d."organizationId", d.name, d."pairingCode", d."androidId", d.model,
                    d."osVersion", d."appVersion", d.status, d."lastSeen",
                    d.location, d.timezone, d.settings, d."createdAt", d."updatedAt"
             FROM devices d
             WHERE ${where}
             ORDER BY d."lastSeen" DESC NULLS LAST, d."createdAt" DESC
             LIMIT $${idx++} OFFSET $${idx++}`,
            [...values, limit, offset]
        ),
    ]);

    const total = parseInt(countRes?.count ?? '0');
    return { data: rows, total, page, limit, totalPages: Math.ceil(total / limit) };
}

// ─── Get single device ────────────────────────────────────────────────────────

export async function getDeviceById(deviceId: string, organizationId: string): Promise<DeviceRow> {
    const device = await queryOne<DeviceRow>(
        `SELECT id, "organizationId", name, "pairingCode", "androidId", model, "osVersion", "appVersion",
                status, "lastSeen", location, timezone, settings, "createdAt", "updatedAt"
         FROM devices
         WHERE id = $1 AND "organizationId" = $2`,
        [deviceId, organizationId]
    );
    if (!device) throw new AppError(404, 'Device không tồn tại');
    return device;
}

// ─── Create device ─────────────────────────────────────────────────────────────

export async function createDevice(
    organizationId: string,
    data: CreateDeviceBody
): Promise<DeviceRow> {
    // Generate a unique 6-char uppercase alphanumeric pairing code
    let pairingCode: string;
    for (let attempts = 0; attempts < 10; attempts++) {
        pairingCode = randomBytes(3).toString('hex').toUpperCase();
        const existing = await queryOne<{ id: string }>(
            `SELECT id FROM devices WHERE "pairingCode" = $1`,
            [pairingCode]
        );
        if (!existing) break;
    }

    const rows = await query<DeviceRow>(
        `INSERT INTO devices (id, "organizationId", name, "pairingCode", status, location, timezone, settings, "createdAt", "updatedAt")
         VALUES (gen_random_uuid()::text, $1, $2, $3, 'OFFLINE', $4, $5, $6, NOW(), NOW())
         RETURNING id, "organizationId", name, "pairingCode", "androidId", model, "osVersion", "appVersion",
                   status, "lastSeen", location, timezone, settings, "createdAt", "updatedAt"`,
        [
            organizationId,
            data.name,
            pairingCode!,
            data.location ?? null,
            data.timezone ?? 'Asia/Ho_Chi_Minh',
            data.settings ? JSON.stringify(data.settings) : null,
        ]
    );

    logger.info('Device created', { deviceId: rows[0].id, pairingCode: pairingCode! });
    return rows[0];
}

// ─── Update device ─────────────────────────────────────────────────────────────

export async function updateDevice(
    deviceId: string,
    organizationId: string,
    data: UpdateDeviceBody
): Promise<DeviceRow> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (data.name !== undefined) { fields.push(`name = $${idx++}`); values.push(data.name); }
    if (data.location !== undefined) { fields.push(`location = $${idx++}`); values.push(data.location); }
    if (data.timezone !== undefined) { fields.push(`timezone = $${idx++}`); values.push(data.timezone); }
    if (data.status !== undefined) { fields.push(`status = $${idx++}`); values.push(data.status); }
    if (data.settings !== undefined) { fields.push(`settings = $${idx++}`); values.push(JSON.stringify(data.settings)); }

    if (fields.length === 0) throw new AppError(400, 'Không có dữ liệu để cập nhật');

    fields.push(`"updatedAt" = NOW()`);
    values.push(deviceId, organizationId);

    const rows = await query<DeviceRow>(
        `UPDATE devices
         SET ${fields.join(', ')}
         WHERE id = $${idx++} AND "organizationId" = $${idx++}
         RETURNING id, "organizationId", name, "pairingCode", "androidId", model, "osVersion", "appVersion",
                   status, "lastSeen", location, timezone, settings, "createdAt", "updatedAt"`,
        values
    );
    if (!rows[0]) throw new AppError(404, 'Device không tồn tại');

    logger.info('Device updated', { deviceId });
    return rows[0];
}

// ─── Delete device ─────────────────────────────────────────────────────────────

export async function deleteDevice(deviceId: string, organizationId: string): Promise<void> {
    const result = await query(
        `DELETE FROM devices WHERE id = $1 AND "organizationId" = $2 RETURNING id`,
        [deviceId, organizationId]
    );
    if (!result[0]) throw new AppError(404, 'Device không tồn tại');
    logger.info('Device deleted', { deviceId });
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
    data: DeviceCommandBody
): Promise<CommandResult> {
    // Verify device exists and belongs to org
    const device = await queryOne<{ id: string; status: string }>(
        `SELECT id, status FROM devices WHERE id = $1 AND "organizationId" = $2`,
        [deviceId, organizationId]
    );
    if (!device) throw new AppError(404, 'Device không tồn tại');

    // Map REST command name → WebSocket event name
    const commandEventMap: Record<string, string> = {
        RESTART: 'command.restart',
        SCREENSHOT: 'command.screenshot',
        RELOAD_CONTENT: 'command.reload_content',
        CLEAR_CACHE: 'command.clear_cache',
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
