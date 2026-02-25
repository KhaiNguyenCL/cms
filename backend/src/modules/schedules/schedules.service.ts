import { query, queryOne } from '../../shared/database/db';
import { AppError } from '../../shared/middleware/error.middleware';
import logger from '../../shared/utils/logger';
import { invalidateContentHashForOrg } from '../device-sync/device-sync.service';
import type { ListSchedulesQuery, CreateScheduleBody, UpdateScheduleBody } from './schedules.schema';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ScheduleRow {
    id: string;
    organizationId: string;
    name: string;
    playlistId: string;
    targetType: string;
    targetDeviceId: string | null;
    targetGroupId: string | null;
    startDate: string;
    endDate: string | null;
    startTime: string | null;
    endTime: string | null;
    daysOfWeek: number[];
    priority: number;
    isActive: boolean;
    // Joined fields
    playlistName?: string;
    targetDeviceName?: string;
    targetGroupName?: string;
    createdAt: string;
    updatedAt: string;
}

export interface PaginatedSchedules {
    data: ScheduleRow[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}

// ─── List schedules ───────────────────────────────────────────────────────────

export async function listSchedules(
    organizationId: string,
    q: ListSchedulesQuery
): Promise<PaginatedSchedules> {
    const { page, limit, search, isActive, targetType } = q;
    const offset = (page - 1) * limit;
    const conditions: string[] = [`s."organizationId" = $1`];
    const values: unknown[] = [organizationId];
    let idx = 2;

    if (search) { conditions.push(`s.name ILIKE $${idx++}`); values.push(`%${search}%`); }
    if (isActive !== undefined) {
        conditions.push(`s."isActive" = $${idx++}`);
        values.push(isActive === 'true');
    }
    if (targetType) { conditions.push(`s."targetType" = $${idx++}`); values.push(targetType); }

    const where = conditions.join(' AND ');

    const [countRes, rows] = await Promise.all([
        queryOne<{ count: string }>(
            `SELECT COUNT(*) as count FROM schedules s WHERE ${where}`, values
        ),
        query<ScheduleRow>(
            `SELECT s.id, s."organizationId", s.name, s."playlistId", s."targetType",
                    s."targetDeviceId", s."targetGroupId",
                    s."startDate", s."endDate", s."startTime", s."endTime",
                    s."daysOfWeek", s.priority, s."isActive",
                    s."createdAt", s."updatedAt",
                    p.name as "playlistName",
                    d.name as "targetDeviceName",
                    g.name as "targetGroupName"
             FROM schedules s
             LEFT JOIN playlists p ON p.id = s."playlistId"
             LEFT JOIN devices d   ON d.id  = s."targetDeviceId"
             LEFT JOIN device_groups g ON g.id = s."targetGroupId"
             WHERE ${where}
             ORDER BY s.priority DESC, s."startDate" ASC, s."createdAt" DESC
             LIMIT $${idx++} OFFSET $${idx++}`,
            [...values, limit, offset]
        ),
    ]);

    const total = parseInt(countRes?.count ?? '0');
    return { data: rows, total, page, limit, totalPages: Math.ceil(total / limit) };
}

// ─── Get single schedule ──────────────────────────────────────────────────────

export async function getScheduleById(scheduleId: string, organizationId: string): Promise<ScheduleRow> {
    const schedule = await queryOne<ScheduleRow>(
        `SELECT s.id, s."organizationId", s.name, s."playlistId", s."targetType",
                s."targetDeviceId", s."targetGroupId",
                s."startDate", s."endDate", s."startTime", s."endTime",
                s."daysOfWeek", s.priority, s."isActive",
                s."createdAt", s."updatedAt",
                p.name as "playlistName",
                d.name as "targetDeviceName",
                g.name as "targetGroupName"
         FROM schedules s
         LEFT JOIN playlists p ON p.id = s."playlistId"
         LEFT JOIN devices d   ON d.id  = s."targetDeviceId"
         LEFT JOIN device_groups g ON g.id = s."targetGroupId"
         WHERE s.id = $1 AND s."organizationId" = $2`,
        [scheduleId, organizationId]
    );
    if (!schedule) throw new AppError(404, 'Schedule không tồn tại');
    return schedule;
}

// ─── Create schedule ──────────────────────────────────────────────────────────

export async function createSchedule(
    organizationId: string,
    data: CreateScheduleBody
): Promise<ScheduleRow> {
    // Verify playlist belongs to org
    const playlist = await queryOne<{ id: string }>(
        `SELECT id FROM playlists WHERE id = $1 AND "organizationId" = $2`,
        [data.playlistId, organizationId]
    );
    if (!playlist) throw new AppError(404, 'Playlist không tồn tại');

    // Verify target device/group if specified
    if (data.targetDeviceId) {
        const device = await queryOne<{ id: string }>(
            `SELECT id FROM devices WHERE id = $1 AND "organizationId" = $2`,
            [data.targetDeviceId, organizationId]
        );
        if (!device) throw new AppError(404, 'Device không tồn tại');
    }
    if (data.targetGroupId) {
        const group = await queryOne<{ id: string }>(
            `SELECT id FROM device_groups WHERE id = $1 AND "organizationId" = $2`,
            [data.targetGroupId, organizationId]
        );
        if (!group) throw new AppError(404, 'Device group không tồn tại');
    }

    const rows = await query<ScheduleRow>(
        `INSERT INTO schedules (
            id, "organizationId", name, "playlistId",
            "targetType", "targetDeviceId", "targetGroupId",
            "startDate", "endDate", "startTime", "endTime",
            "daysOfWeek", priority, "isActive",
            "createdAt", "updatedAt"
         ) VALUES (
            gen_random_uuid()::text, $1, $2, $3,
            $4, $5, $6,
            $7::timestamp, $8::timestamp, $9, $10,
            $11, $12, $13,
            NOW(), NOW()
         )
         RETURNING id, "organizationId", name, "playlistId",
                   "targetType", "targetDeviceId", "targetGroupId",
                   "startDate", "endDate", "startTime", "endTime",
                   "daysOfWeek", priority, "isActive", "createdAt", "updatedAt"`,
        [
            organizationId, data.name, data.playlistId,
            data.targetType, data.targetDeviceId ?? null, data.targetGroupId ?? null,
            data.startDate, data.endDate ?? null, data.startTime ?? null, data.endTime ?? null,
            data.daysOfWeek ?? [], data.priority ?? 0, data.isActive ?? true,
        ]
    );

    logger.info('Schedule created', { scheduleId: rows[0].id, organizationId });
    invalidateContentHashForOrg(organizationId).catch(() => {}); // fire-and-forget
    return rows[0];
}

// ─── Update schedule ──────────────────────────────────────────────────────────

export async function updateSchedule(
    scheduleId: string,
    organizationId: string,
    data: UpdateScheduleBody
): Promise<ScheduleRow> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (data.name !== undefined) { fields.push(`name = $${idx++}`); values.push(data.name); }
    if (data.playlistId !== undefined) { fields.push(`"playlistId" = $${idx++}`); values.push(data.playlistId); }
    if (data.targetType !== undefined) { fields.push(`"targetType" = $${idx++}`); values.push(data.targetType); }
    if (data.targetDeviceId !== undefined) { fields.push(`"targetDeviceId" = $${idx++}`); values.push(data.targetDeviceId); }
    if (data.targetGroupId !== undefined) { fields.push(`"targetGroupId" = $${idx++}`); values.push(data.targetGroupId); }
    if (data.startDate !== undefined) { fields.push(`"startDate" = $${idx++}::timestamp`); values.push(data.startDate); }
    if (data.endDate !== undefined) { fields.push(`"endDate" = $${idx++}::timestamp`); values.push(data.endDate); }
    if (data.startTime !== undefined) { fields.push(`"startTime" = $${idx++}`); values.push(data.startTime); }
    if (data.endTime !== undefined) { fields.push(`"endTime" = $${idx++}`); values.push(data.endTime); }
    if (data.daysOfWeek !== undefined) { fields.push(`"daysOfWeek" = $${idx++}`); values.push(data.daysOfWeek); }
    if (data.priority !== undefined) { fields.push(`priority = $${idx++}`); values.push(data.priority); }
    if (data.isActive !== undefined) { fields.push(`"isActive" = $${idx++}`); values.push(data.isActive); }

    if (fields.length === 0) throw new AppError(400, 'Không có dữ liệu để cập nhật');
    fields.push(`"updatedAt" = NOW()`);
    values.push(scheduleId, organizationId);

    const rows = await query<ScheduleRow>(
        `UPDATE schedules SET ${fields.join(', ')}
         WHERE id = $${idx++} AND "organizationId" = $${idx++}
         RETURNING id, "organizationId", name, "playlistId",
                   "targetType", "targetDeviceId", "targetGroupId",
                   "startDate", "endDate", "startTime", "endTime",
                   "daysOfWeek", priority, "isActive", "createdAt", "updatedAt"`,
        values
    );
    if (!rows[0]) throw new AppError(404, 'Schedule không tồn tại');
    logger.info('Schedule updated', { scheduleId });
    invalidateContentHashForOrg(organizationId).catch(() => {}); // fire-and-forget
    return rows[0];
}

// ─── Delete schedule ──────────────────────────────────────────────────────────

export async function deleteSchedule(scheduleId: string, organizationId: string): Promise<void> {
    const result = await query(
        `DELETE FROM schedules WHERE id = $1 AND "organizationId" = $2 RETURNING id`,
        [scheduleId, organizationId]
    );
    if (!result[0]) throw new AppError(404, 'Schedule không tồn tại');
    logger.info('Schedule deleted', { scheduleId });
    invalidateContentHashForOrg(organizationId).catch(() => {}); // fire-and-forget
}

// ─── Get active schedules for a device (used by device-sync) ─────────────────
// Returns schedules active RIGHT NOW for a given device (considering daysOfWeek + time window)

export async function getActiveSchedulesForDevice(
    deviceId: string,
    organizationId: string
): Promise<ScheduleRow[]> {
    // Get device's group via settings.groupId
    const device = await queryOne<{ id: string; settings: any }>(
        `SELECT id, settings FROM devices WHERE id = $1 AND "organizationId" = $2`,
        [deviceId, organizationId]
    );
    if (!device) throw new AppError(404, 'Device không tồn tại');

    const groupId = device.settings?.groupId ?? null;

    // Build query for schedules matching this device
    return query<ScheduleRow>(
        `SELECT s.id, s."organizationId", s.name, s."playlistId", s."targetType",
                s."targetDeviceId", s."targetGroupId",
                s."startDate", s."endDate", s."startTime", s."endTime",
                s."daysOfWeek", s.priority, s."isActive",
                s."createdAt", s."updatedAt",
                p.name as "playlistName"
         FROM schedules s
         LEFT JOIN playlists p ON p.id = s."playlistId"
         WHERE s."organizationId" = $1
           AND s."isActive" = true
           AND s."startDate" <= NOW()
           AND (s."endDate" IS NULL OR s."endDate" >= NOW())
           AND (
               s."targetType" = 'ALL'
               OR (s."targetType" = 'DEVICE' AND s."targetDeviceId" = $2)
               OR (s."targetType" = 'GROUP'  AND s."targetGroupId"  = $3)
           )
         ORDER BY s.priority DESC`,
        [organizationId, deviceId, groupId]
    );
}
