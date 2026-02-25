import { query, queryOne } from '../../shared/database/db';
import { AppError } from '../../shared/middleware/error.middleware';
import logger from '../../shared/utils/logger';
import type { ListGroupsQuery, CreateGroupBody, UpdateGroupBody } from './device-groups.schema';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GroupRow {
    id: string;
    organizationId: string;
    name: string;
    description: string | null;
    deviceCount: number;
    createdAt: string;
    updatedAt: string;
}

export interface GroupDetailRow extends GroupRow {
    devices: DeviceMemberRow[];
}

export interface DeviceMemberRow {
    id: string;
    name: string;
    status: string;
    location: string | null;
    model: string | null;
    lastSeen: string | null;
}

export interface PaginatedGroups {
    data: GroupRow[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}

// ─── List groups ──────────────────────────────────────────────────────────────

export async function listGroups(organizationId: string, q: ListGroupsQuery): Promise<PaginatedGroups> {
    const { page, limit, search } = q;
    const offset = (page - 1) * limit;
    const conditions: string[] = [`g."organizationId" = $1`];
    const values: unknown[] = [organizationId];
    let idx = 2;

    if (search) {
        conditions.push(`g.name ILIKE $${idx++}`);
        values.push(`%${search}%`);
    }

    const where = conditions.join(' AND ');

    const [countRes, rows] = await Promise.all([
        queryOne<{ count: string }>(
            `SELECT COUNT(*) as count FROM device_groups g WHERE ${where}`,
            values
        ),
        query<GroupRow>(
            `SELECT g.id, g."organizationId", g.name, g.description, g."createdAt", g."updatedAt",
                    COUNT(m."deviceId")::int as "deviceCount"
             FROM device_groups g
             LEFT JOIN device_group_members m ON m."groupId" = g.id
             WHERE ${where}
             GROUP BY g.id
             ORDER BY g.name ASC
             LIMIT $${idx++} OFFSET $${idx++}`,
            [...values, limit, offset]
        ),
    ]);

    const total = parseInt(countRes?.count ?? '0');
    return { data: rows, total, page, limit, totalPages: Math.ceil(total / limit) };
}

// ─── Get group by id ─────────────────────────────────────────────────────────

export async function getGroupById(groupId: string, organizationId: string): Promise<GroupDetailRow> {
    const group = await queryOne<GroupRow>(
        `SELECT g.id, g."organizationId", g.name, g.description, g."createdAt", g."updatedAt",
                COUNT(m."deviceId")::int as "deviceCount"
         FROM device_groups g
         LEFT JOIN device_group_members m ON m."groupId" = g.id
         WHERE g.id = $1 AND g."organizationId" = $2
         GROUP BY g.id`,
        [groupId, organizationId]
    );
    if (!group) throw new AppError(404, 'Device group không tồn tại');

    // Get members
    const devices = await query<DeviceMemberRow>(
        `SELECT d.id, d.name, d.status, d.location, d.model, d."lastSeen"
         FROM device_group_members m
         JOIN devices d ON d.id = m."deviceId"
         WHERE m."groupId" = $1
         ORDER BY d.name ASC`,
        [groupId]
    );

    return { ...group, devices };
}

// ─── Create group ─────────────────────────────────────────────────────────────

export async function createGroup(organizationId: string, data: CreateGroupBody): Promise<GroupRow> {
    const rows = await query<GroupRow>(
        `INSERT INTO device_groups (id, "organizationId", name, description, "createdAt", "updatedAt")
         VALUES (gen_random_uuid()::text, $1, $2, $3, NOW(), NOW())
         RETURNING id, "organizationId", name, description, "createdAt", "updatedAt",
                   0 as "deviceCount"`,
        [organizationId, data.name, data.description ?? null]
    );
    logger.info('Device group created', { groupId: rows[0].id, organizationId });
    return rows[0];
}

// ─── Update group ─────────────────────────────────────────────────────────────

export async function updateGroup(groupId: string, organizationId: string, data: UpdateGroupBody): Promise<GroupRow> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (data.name !== undefined) { fields.push(`name = $${idx++}`); values.push(data.name); }
    if (data.description !== undefined) { fields.push(`description = $${idx++}`); values.push(data.description); }

    if (fields.length === 0) throw new AppError(400, 'Không có dữ liệu để cập nhật');
    fields.push(`"updatedAt" = NOW()`);
    values.push(groupId, organizationId);

    const rows = await query<GroupRow>(
        `UPDATE device_groups SET ${fields.join(', ')}
         WHERE id = $${idx++} AND "organizationId" = $${idx++}
         RETURNING id, "organizationId", name, description, "createdAt", "updatedAt", 0 as "deviceCount"`,
        values
    );
    if (!rows[0]) throw new AppError(404, 'Device group không tồn tại');
    logger.info('Device group updated', { groupId });
    return rows[0];
}

// ─── Delete group ─────────────────────────────────────────────────────────────

export async function deleteGroup(groupId: string, organizationId: string): Promise<void> {
    const result = await query(
        `DELETE FROM device_groups WHERE id = $1 AND "organizationId" = $2 RETURNING id`,
        [groupId, organizationId]
    );
    if (!result[0]) throw new AppError(404, 'Device group không tồn tại');
    logger.info('Device group deleted', { groupId });
}

// ─── Add device to group ──────────────────────────────────────────────────────

export async function addDeviceToGroup(groupId: string, deviceId: string, organizationId: string): Promise<void> {
    // Verify group belongs to org
    const group = await queryOne<{ id: string }>(
        `SELECT id FROM device_groups WHERE id = $1 AND "organizationId" = $2`,
        [groupId, organizationId]
    );
    if (!group) throw new AppError(404, 'Device group không tồn tại');

    // Verify device belongs to org
    const device = await queryOne<{ id: string }>(
        `SELECT id FROM devices WHERE id = $1 AND "organizationId" = $2`,
        [deviceId, organizationId]
    );
    if (!device) throw new AppError(404, 'Device không tồn tại');

    // Upsert (ignore duplicate)
    await query(
        `INSERT INTO device_group_members ("deviceId", "groupId")
         VALUES ($1, $2)
         ON CONFLICT ("deviceId", "groupId") DO NOTHING`,
        [deviceId, groupId]
    );
    logger.info('Device added to group', { groupId, deviceId });
}

// ─── Remove device from group ─────────────────────────────────────────────────

export async function removeDeviceFromGroup(groupId: string, deviceId: string, organizationId: string): Promise<void> {
    // Verify group belongs to org
    const group = await queryOne<{ id: string }>(
        `SELECT id FROM device_groups WHERE id = $1 AND "organizationId" = $2`,
        [groupId, organizationId]
    );
    if (!group) throw new AppError(404, 'Device group không tồn tại');

    await query(
        `DELETE FROM device_group_members WHERE "deviceId" = $1 AND "groupId" = $2`,
        [deviceId, groupId]
    );
    logger.info('Device removed from group', { groupId, deviceId });
}

// ─── Get groups for a device ──────────────────────────────────────────────────

export async function getGroupsForDevice(deviceId: string): Promise<GroupRow[]> {
    return query<GroupRow>(
        `SELECT g.id, g."organizationId", g.name, g.description, g."createdAt", g."updatedAt",
                COUNT(m2."deviceId")::int as "deviceCount"
         FROM device_group_members m
         JOIN device_groups g ON g.id = m."groupId"
         LEFT JOIN device_group_members m2 ON m2."groupId" = g.id
         WHERE m."deviceId" = $1
         GROUP BY g.id
         ORDER BY g.name ASC`,
        [deviceId]
    );
}
