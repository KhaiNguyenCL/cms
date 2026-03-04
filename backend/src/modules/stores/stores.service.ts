import { query, queryOne } from '../../shared/database/db';
import { AppError } from '../../shared/middleware/error.middleware';
import logger from '../../shared/utils/logger';
import type {
    ListStoresQuery,
    CreateStoreBody,
    UpdateStoreBody,
    UpdateStoreDevices,
} from './stores.schema';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StoreRow {
    id: string;
    organizationId: string;
    name: string;
    description: string | null;
    address: string | null;
    contact: string | null;
    openDate: string | null;
    closeDate: string | null;
    playlistId: string | null;
    playlistName: string | null;
    startEpoch: string | null;   // bigint → string from pg driver
    totalDurationMs: number | null;
    deviceCount: number;
    onlineCount: number;
    createdAt: string;
    updatedAt: string;
}

export interface StoreDevice {
    id: string;
    name: string;
    status: string;
    location: string | null;
    model: string | null;
}

// ─── List ─────────────────────────────────────────────────────────────────────

export async function listStores(
    organizationId: string,
    q: ListStoresQuery,
) {
    const { page, limit, search } = q;
    const offset = (page - 1) * limit;

    const conditions = [`s."organizationId" = $1`];
    const values: unknown[] = [organizationId];
    let idx = 2;

    if (search) {
        conditions.push(`s.name ILIKE $${idx++}`);
        values.push(`%${search}%`);
    }

    const where = conditions.join(' AND ');

    const [countRes, rows] = await Promise.all([
        queryOne<{ count: string }>(
            `SELECT COUNT(*) AS count FROM stores s WHERE ${where}`, values,
        ),
        query<StoreRow>(
            `SELECT s.id, s."organizationId", s.name, s.description,
                    s.address, s.contact, s."openDate", s."closeDate",
                    s."playlistId", p.name AS "playlistName",
                    s."startEpoch", s."totalDurationMs",
                    s."createdAt", s."updatedAt",
                    COUNT(d.id)::int                                            AS "deviceCount",
                    COUNT(d.id) FILTER (WHERE d.status = 'ONLINE')::int         AS "onlineCount"
             FROM stores s
             LEFT JOIN playlists p ON p.id = s."playlistId"
             LEFT JOIN devices d   ON d."storeId" = s.id
             WHERE ${where}
             GROUP BY s.id, p.name
             ORDER BY s."createdAt" DESC
             LIMIT $${idx++} OFFSET $${idx++}`,
            [...values, limit, offset],
        ),
    ]);

    const total = parseInt(countRes?.count ?? '0');
    return { data: rows, total, page, limit, totalPages: Math.ceil(total / limit) };
}

// ─── Get single ───────────────────────────────────────────────────────────────

export async function getStoreById(id: string, organizationId: string) {
    const store = await queryOne<StoreRow>(
        `SELECT s.id, s."organizationId", s.name, s.description,
                s.address, s.contact, s."openDate", s."closeDate",
                s."playlistId", p.name AS "playlistName",
                s."startEpoch", s."totalDurationMs",
                s."createdAt", s."updatedAt",
                COUNT(d.id)::int                                            AS "deviceCount",
                COUNT(d.id) FILTER (WHERE d.status = 'ONLINE')::int         AS "onlineCount"
         FROM stores s
         LEFT JOIN playlists p ON p.id = s."playlistId"
         LEFT JOIN devices d   ON d."storeId" = s.id
         WHERE s.id = $1 AND s."organizationId" = $2
         GROUP BY s.id, p.name`,
        [id, organizationId],
    );
    if (!store) throw new AppError(404, 'Store không tồn tại');

    const devices = await query<StoreDevice>(
        `SELECT id, name, status, location, model
         FROM devices WHERE "storeId" = $1 ORDER BY name`,
        [id],
    );

    return { ...store, devices };
}

// ─── Create ───────────────────────────────────────────────────────────────────

export async function createStore(
    organizationId: string,
    data: CreateStoreBody,
) {
    if (data.playlistId) {
        const pl = await queryOne<{ id: string }>(
            `SELECT id FROM playlists WHERE id = $1 AND "organizationId" = $2`,
            [data.playlistId, organizationId],
        );
        if (!pl) throw new AppError(404, 'Playlist không tồn tại');
    }

    const row = await queryOne<StoreRow>(
        `INSERT INTO stores (id, "organizationId", name, description, address, contact, "openDate", "closeDate", "playlistId", "createdAt", "updatedAt")
         VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
         RETURNING id, "organizationId", name, description, address, contact, "openDate", "closeDate", "playlistId",
                   NULL AS "playlistName", "startEpoch", "totalDurationMs",
                   0::int AS "deviceCount", 0::int AS "onlineCount",
                   "createdAt", "updatedAt"`,
        [
            organizationId, data.name, data.description ?? null,
            data.address ?? null, data.contact ?? null,
            data.openDate ?? null, data.closeDate ?? null,
            data.playlistId ?? null,
        ],
    );
    logger.info('Store created', { id: row!.id, organizationId });
    return row!;
}

// ─── Update ───────────────────────────────────────────────────────────────────

export async function updateStore(
    id: string,
    organizationId: string,
    data: UpdateStoreBody,
) {
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (data.name !== undefined)        { fields.push(`name = $${idx++}`);           values.push(data.name); }
    if (data.description !== undefined) { fields.push(`description = $${idx++}`);    values.push(data.description); }
    if (data.address !== undefined)     { fields.push(`address = $${idx++}`);         values.push(data.address); }
    if (data.contact !== undefined)     { fields.push(`contact = $${idx++}`);         values.push(data.contact); }
    if (data.openDate !== undefined)    { fields.push(`"openDate" = $${idx++}`);      values.push(data.openDate); }
    if (data.closeDate !== undefined)   { fields.push(`"closeDate" = $${idx++}`);     values.push(data.closeDate); }
    if (data.playlistId !== undefined)  { fields.push(`"playlistId" = $${idx++}`);   values.push(data.playlistId); }

    if (fields.length === 0) throw new AppError(400, 'Không có dữ liệu để cập nhật');
    fields.push(`"updatedAt" = NOW()`);
    values.push(id, organizationId);

    const row = await queryOne<{ id: string }>(
        `UPDATE stores SET ${fields.join(', ')}
         WHERE id = $${idx++} AND "organizationId" = $${idx++}
         RETURNING id`,
        values,
    );
    if (!row) throw new AppError(404, 'Store không tồn tại');
    return getStoreById(id, organizationId);
}

// ─── Delete ───────────────────────────────────────────────────────────────────

export async function deleteStore(id: string, organizationId: string) {
    await query(
        `UPDATE devices SET "storeId" = NULL WHERE "storeId" = $1`, [id],
    );
    const res = await queryOne<{ id: string }>(
        `DELETE FROM stores WHERE id = $1 AND "organizationId" = $2 RETURNING id`,
        [id, organizationId],
    );
    if (!res) throw new AppError(404, 'Store không tồn tại');
    logger.info('Store deleted', { id, organizationId });
}

// ─── Start / Restart / Stop ───────────────────────────────────────────────────

export async function startStore(id: string, organizationId: string) {
    const store = await queryOne<{ playlistId: string | null }>(
        `SELECT "playlistId" FROM stores WHERE id = $1 AND "organizationId" = $2`,
        [id, organizationId],
    );
    if (!store) throw new AppError(404, 'Store không tồn tại');
    if (!store.playlistId) throw new AppError(400, 'Store chưa có playlist — hãy gán playlist trước');

    const items = await query<{ durationOverride: number | null; duration: number | null }>(
        `SELECT pi."durationOverride", m.duration
         FROM playlist_items pi
         LEFT JOIN media m ON m.id = pi."mediaId"
         WHERE pi."playlistId" = $1
         ORDER BY pi.position ASC`,
        [store.playlistId],
    );
    if (items.length === 0) throw new AppError(400, 'Playlist không có media nào');

    const totalDurationMs = items.reduce((sum, item) => {
        const secs = item.durationOverride ?? item.duration ?? 10;
        return sum + secs * 1000;
    }, 0);

    const startEpoch = Date.now();

    await query(
        `UPDATE stores
         SET "startEpoch" = $1, "totalDurationMs" = $2, "updatedAt" = NOW()
         WHERE id = $3`,
        [startEpoch, totalDurationMs, id],
    );

    logger.info('Store sync started', { id, startEpoch, totalDurationMs });
    return { id, startEpoch, totalDurationMs, playlistId: store.playlistId };
}

export async function stopStore(id: string, organizationId: string) {
    const res = await queryOne<{ id: string }>(
        `UPDATE stores SET "startEpoch" = NULL, "updatedAt" = NOW()
         WHERE id = $1 AND "organizationId" = $2 RETURNING id`,
        [id, organizationId],
    );
    if (!res) throw new AppError(404, 'Store không tồn tại');
    logger.info('Store sync stopped', { id });
}

// ─── Assign / remove devices ──────────────────────────────────────────────────

export async function updateStoreDevices(
    id: string,
    organizationId: string,
    data: UpdateStoreDevices,
) {
    const store = await queryOne<{ id: string }>(
        `SELECT id FROM stores WHERE id = $1 AND "organizationId" = $2`,
        [id, organizationId],
    );
    if (!store) throw new AppError(404, 'Store không tồn tại');

    if (data.add && data.add.length > 0) {
        await query(
            `UPDATE devices SET "storeId" = $1, "updatedAt" = NOW()
             WHERE id = ANY($2::text[]) AND "organizationId" = $3`,
            [id, data.add, organizationId],
        );
    }

    if (data.remove && data.remove.length > 0) {
        await query(
            `UPDATE devices SET "storeId" = NULL, "updatedAt" = NOW()
             WHERE id = ANY($1::text[]) AND "storeId" = $2 AND "organizationId" = $3`,
            [data.remove, id, organizationId],
        );
    }

    return getStoreById(id, organizationId);
}
