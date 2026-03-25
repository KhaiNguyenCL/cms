import { query, queryOne } from '../../shared/database/db';
import { AppError } from '../../shared/middleware/error.middleware';
import logger from '../../shared/utils/logger';
import type {
    ListSyncGroupsQuery,
    CreateSyncGroupBody,
    UpdateSyncGroupBody,
    UpdateSyncGroupDevices,
} from './sync-groups.schema';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SyncGroupRow {
    id: string;
    organizationId: string;
    name: string;
    description: string | null;
    playlistId: string | null;
    playlistName: string | null;
    startEpoch: string | null;   // bigint → string from pg driver
    totalDurationMs: number | null;
    deviceCount: number;
    onlineCount: number;
    createdAt: string;
    updatedAt: string;
}

export interface SyncGroupDevice {
    id: string;
    name: string;
    status: string;
    location: string | null;
    model: string | null;
}

// ─── List ─────────────────────────────────────────────────────────────────────

export async function listSyncGroups(
    organizationId: string,
    q: ListSyncGroupsQuery,
) {
    const { page, limit, search } = q;
    const offset = (page - 1) * limit;

    const conditions = [`sg."organizationId" = $1`];
    const values: unknown[] = [organizationId];
    let idx = 2;

    if (search) {
        conditions.push(`sg.name ILIKE $${idx++}`);
        values.push(`%${search}%`);
    }

    const where = conditions.join(' AND ');

    const [countRes, rows] = await Promise.all([
        queryOne<{ count: string }>(
            `SELECT COUNT(*) AS count FROM sync_groups sg WHERE ${where}`, values,
        ),
        query<SyncGroupRow>(
            `SELECT sg.id, sg."organizationId", sg.name, sg.description,
                    sg."playlistId", p.name AS "playlistName",
                    sg."startEpoch", sg."totalDurationMs",
                    sg."createdAt", sg."updatedAt",
                    COUNT(d.id)::int                                              AS "deviceCount",
                    COUNT(d.id) FILTER (WHERE d.status = 'ONLINE')::int           AS "onlineCount"
             FROM sync_groups sg
             LEFT JOIN playlists p ON p.id = sg."playlistId"
             LEFT JOIN devices d   ON d."syncGroupId" = sg.id
             WHERE ${where}
             GROUP BY sg.id, p.name
             ORDER BY sg."createdAt" DESC
             LIMIT $${idx++} OFFSET $${idx++}`,
            [...values, limit, offset],
        ),
    ]);

    const total = parseInt(countRes?.count ?? '0');
    return { data: rows, total, page, limit, totalPages: Math.ceil(total / limit) };
}

// ─── Get single ───────────────────────────────────────────────────────────────

export async function getSyncGroupById(id: string, organizationId: string) {
    const group = await queryOne<SyncGroupRow>(
        `SELECT sg.id, sg."organizationId", sg.name, sg.description,
                sg."playlistId", p.name AS "playlistName",
                sg."startEpoch", sg."totalDurationMs",
                sg."createdAt", sg."updatedAt",
                COUNT(d.id)::int                                              AS "deviceCount",
                COUNT(d.id) FILTER (WHERE d.status = 'ONLINE')::int           AS "onlineCount"
         FROM sync_groups sg
         LEFT JOIN playlists p ON p.id = sg."playlistId"
         LEFT JOIN devices d   ON d."syncGroupId" = sg.id
         WHERE sg.id = $1 AND sg."organizationId" = $2
         GROUP BY sg.id, p.name`,
        [id, organizationId],
    );
    if (!group) throw new AppError(404, 'Sync group không tồn tại');

    const devices = await query<SyncGroupDevice>(
        `SELECT id, name, status, location, model
         FROM devices WHERE "syncGroupId" = $1 ORDER BY name`,
        [id],
    );

    return { ...group, devices };
}

// ─── Create ───────────────────────────────────────────────────────────────────

export async function createSyncGroup(
    organizationId: string,
    data: CreateSyncGroupBody,
) {
    if (data.playlistId) {
        const pl = await queryOne<{ id: string }>(
            `SELECT id FROM playlists WHERE id = $1 AND "organizationId" = $2`,
            [data.playlistId, organizationId],
        );
        if (!pl) throw new AppError(404, 'Playlist không tồn tại');
    }

    const row = await queryOne<SyncGroupRow>(
        `INSERT INTO sync_groups (id, "organizationId", name, description, "playlistId", "createdAt", "updatedAt")
         VALUES (gen_random_uuid()::text, $1, $2, $3, $4, NOW(), NOW())
         RETURNING id, "organizationId", name, description, "playlistId",
                   NULL AS "playlistName", "startEpoch", "totalDurationMs",
                   0::int AS "deviceCount", 0::int AS "onlineCount",
                   "createdAt", "updatedAt"`,
        [organizationId, data.name, data.description ?? null, data.playlistId ?? null],
    );
    logger.info('SyncGroup created', { id: row!.id, organizationId });
    return row!;
}

// ─── Update ───────────────────────────────────────────────────────────────────

export async function updateSyncGroup(
    id: string,
    organizationId: string,
    data: UpdateSyncGroupBody,
) {
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (data.name !== undefined)        { fields.push(`name = $${idx++}`);          values.push(data.name); }
    if (data.description !== undefined) { fields.push(`description = $${idx++}`);   values.push(data.description); }
    if (data.playlistId !== undefined)  { fields.push(`"playlistId" = $${idx++}`);  values.push(data.playlistId); }

    if (fields.length === 0) throw new AppError(400, 'Không có dữ liệu để cập nhật');
    fields.push(`"updatedAt" = NOW()`);
    values.push(id, organizationId);

    const row = await queryOne<{ id: string }>(
        `UPDATE sync_groups SET ${fields.join(', ')}
         WHERE id = $${idx++} AND "organizationId" = $${idx++}
         RETURNING id`,
        values,
    );
    if (!row) throw new AppError(404, 'Sync group không tồn tại');
    return getSyncGroupById(id, organizationId);
}

// ─── Delete ───────────────────────────────────────────────────────────────────

export async function deleteSyncGroup(id: string, organizationId: string) {
    // Detach all devices first
    await query(
        `UPDATE devices SET "syncGroupId" = NULL WHERE "syncGroupId" = $1`, [id],
    );
    const res = await queryOne<{ id: string }>(
        `DELETE FROM sync_groups WHERE id = $1 AND "organizationId" = $2 RETURNING id`,
        [id, organizationId],
    );
    if (!res) throw new AppError(404, 'Sync group không tồn tại');
    logger.info('SyncGroup deleted', { id, organizationId });
}

// ─── Start / Restart / Stop ───────────────────────────────────────────────────

export async function startSyncGroup(id: string, organizationId: string) {
    const group = await queryOne<{ playlistId: string | null }>(
        `SELECT "playlistId" FROM sync_groups WHERE id = $1 AND "organizationId" = $2`,
        [id, organizationId],
    );
    if (!group) throw new AppError(404, 'Sync group không tồn tại');
    if (!group.playlistId) throw new AppError(400, 'Sync group chưa có playlist — hãy gán playlist trước');

    // Calculate total duration from playlist items (must match calculateSyncPosition in frontend)
    const items = await query<{ durationOverride: number | null; duration: number | null; transitionDuration: number | null }>(
        `SELECT pi."durationOverride", pi."transitionDuration", m.duration
         FROM playlist_items pi
         LEFT JOIN media m ON m.id = pi."mediaId"
         WHERE pi."playlistId" = $1
         ORDER BY pi.position ASC`,
        [group.playlistId],
    );
    if (items.length === 0) throw new AppError(400, 'Playlist không có media nào');

    // durationOverride and media.duration are in seconds; convert to ms.
    // IMPORTANT: must include transitionDuration per item — same formula as frontend calculateSyncPosition.
    const DEFAULT_TRANS_MS = 800;
    const totalDurationMs = items.reduce((sum, item, idx) => {
        const dur = (item.durationOverride ?? item.duration ?? 10) * 1000;
        const nextItem = items[(idx + 1) % items.length];
        const trans = nextItem.transitionDuration ?? DEFAULT_TRANS_MS;
        return sum + dur + trans;
    }, 0);

    const startEpoch = Date.now();

    await query(
        `UPDATE sync_groups
         SET "startEpoch" = $1, "totalDurationMs" = $2, "updatedAt" = NOW()
         WHERE id = $3`,
        [startEpoch, totalDurationMs, id],
    );

    logger.info('SyncGroup started', { id, startEpoch, totalDurationMs });
    return { id, startEpoch, totalDurationMs, playlistId: group.playlistId };
}

export async function stopSyncGroup(id: string, organizationId: string) {
    const res = await queryOne<{ id: string }>(
        `UPDATE sync_groups SET "startEpoch" = NULL, "updatedAt" = NOW()
         WHERE id = $1 AND "organizationId" = $2 RETURNING id`,
        [id, organizationId],
    );
    if (!res) throw new AppError(404, 'Sync group không tồn tại');
    logger.info('SyncGroup stopped', { id });
}

// ─── Assign / remove devices ──────────────────────────────────────────────────

export async function updateSyncGroupDevices(
    id: string,
    organizationId: string,
    data: UpdateSyncGroupDevices,
) {
    // Verify group exists in org
    const group = await queryOne<{ id: string }>(
        `SELECT id FROM sync_groups WHERE id = $1 AND "organizationId" = $2`,
        [id, organizationId],
    );
    if (!group) throw new AppError(404, 'Sync group không tồn tại');

    if (data.add && data.add.length > 0) {
        // Only add devices that belong to this org
        await query(
            `UPDATE devices SET "syncGroupId" = $1, "updatedAt" = NOW()
             WHERE id = ANY($2::text[]) AND "organizationId" = $3`,
            [id, data.add, organizationId],
        );
    }

    if (data.remove && data.remove.length > 0) {
        await query(
            `UPDATE devices SET "syncGroupId" = NULL, "updatedAt" = NOW()
             WHERE id = ANY($1::text[]) AND "syncGroupId" = $2 AND "organizationId" = $3`,
            [data.remove, id, organizationId],
        );
    }

    return getSyncGroupById(id, organizationId);
}
