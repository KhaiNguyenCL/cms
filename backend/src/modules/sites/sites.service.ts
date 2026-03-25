import { query, queryOne } from '../../shared/database/db';
import { AppError, handleUniqueViolation } from '../../shared/middleware/error.middleware';
import logger from '../../shared/utils/logger';
import { invalidateContentHashForOrg } from '../device-sync/device-sync.service';
import { broadcastContentUpdate } from '../../shared/socket/socket.server';
import type {
    ListSitesQuery,
    CreateSiteBody,
    UpdateSiteBody,
    UpdateSiteDevices,
} from './sites.schema';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SiteRow {
    id: string;
    organizationId: string;
    name: string;
    description: string | null;
    address: string | null;
    contact: string | null;
    timezone: string | null;      // IANA timezone — all devices in site inherit if device.timezone is null
    timeOn: string | null;        // HH:MM — screen-on time
    timeOff: string | null;       // HH:MM — screen-off time
    deployDate: string | null;    // ISO date — deployment start
    endDate: string | null;       // ISO date — deployment end
    playlistId: string | null;
    playlistName: string | null;
    startEpoch: string | null;   // bigint → string from pg driver
    totalDurationMs: number | null;
    deviceCount: number;
    onlineCount: number;
    deviceNames: string[];
    createdAt: string;
    updatedAt: string;
}

export interface SiteDevice {
    id: string;
    name: string;
    status: string;
    location: string | null;
    model: string | null;
    role: string;
}

// ─── List ─────────────────────────────────────────────────────────────────────

export async function listSites(
    organizationId: string,
    q: ListSitesQuery,
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
        query<SiteRow>(
            `SELECT s.id, s."organizationId", s.name, s.description,
                    s.address, s.contact, s.timezone,
                    s."timeOn", s."timeOff", s."deployDate", s."endDate",
                    s."playlistId", p.name AS "playlistName",
                    s."startEpoch", s."totalDurationMs",
                    s."createdAt", s."updatedAt",
                    COUNT(d.id)::int                                            AS "deviceCount",
                    COUNT(d.id) FILTER (WHERE d.status = 'ONLINE')::int         AS "onlineCount",
                    COALESCE(ARRAY_AGG(d.name ORDER BY d.name) FILTER (WHERE d.id IS NOT NULL), '{}') AS "deviceNames"
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

export async function getSiteById(id: string, organizationId: string) {
    const site = await queryOne<SiteRow>(
        `SELECT s.id, s."organizationId", s.name, s.description,
                s.address, s.contact, s.timezone,
                s."timeOn", s."timeOff", s."deployDate", s."endDate",
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
    if (!site) throw new AppError(404, 'Site không tồn tại');

    const devices = await query<SiteDevice>(
        `SELECT id, name, status, location, model, role
         FROM devices WHERE "storeId" = $1 ORDER BY name`,
        [id],
    );

    return { ...site, devices };
}

// ─── Create ───────────────────────────────────────────────────────────────────

export async function createSite(
    organizationId: string,
    data: CreateSiteBody,
) {
    if (data.playlistId) {
        const pl = await queryOne<{ id: string }>(
            `SELECT id FROM playlists WHERE id = $1 AND "organizationId" = $2`,
            [data.playlistId, organizationId],
        );
        if (!pl) throw new AppError(404, 'Playlist không tồn tại');
    }

    let row: SiteRow | null;
    try {
        row = await queryOne<SiteRow>(
            `INSERT INTO stores (id, "organizationId", name, description, address, contact, timezone,
                                 "timeOn", "timeOff", "deployDate", "endDate", "playlistId", "createdAt", "updatedAt")
             VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
             RETURNING id, "organizationId", name, description, address, contact, timezone,
                       "timeOn", "timeOff", "deployDate", "endDate", "playlistId",
                       NULL AS "playlistName", "startEpoch", "totalDurationMs",
                       0::int AS "deviceCount", 0::int AS "onlineCount",
                       "createdAt", "updatedAt"`,
            [
                organizationId, data.name, data.description ?? null,
                data.address ?? null, data.contact ?? null,
                data.timezone ?? null,
                data.timeOn ?? null, data.timeOff ?? null,
                data.deployDate ?? null, data.endDate ?? null,
                data.playlistId ?? null,
            ],
        );
    } catch (err) {
        handleUniqueViolation(err, 'Tên site đã tồn tại trong tổ chức');
    }
    logger.info('Site created', { id: row!.id, organizationId });

    // Auto-start sync if playlist was provided at creation time
    if (data.playlistId) {
        await startSite(row!.id, organizationId).catch(() => { /* playlist may be empty */ });
    }

    return row!;
}

// ─── Update ───────────────────────────────────────────────────────────────────

export async function updateSite(
    id: string,
    organizationId: string,
    data: UpdateSiteBody,
) {
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (data.name !== undefined)        { fields.push(`name = $${idx++}`);             values.push(data.name); }
    if (data.description !== undefined) { fields.push(`description = $${idx++}`);      values.push(data.description); }
    if (data.address !== undefined)     { fields.push(`address = $${idx++}`);           values.push(data.address); }
    if (data.contact !== undefined)     { fields.push(`contact = $${idx++}`);           values.push(data.contact); }
    if (data.timezone !== undefined)    { fields.push(`timezone = $${idx++}`);          values.push(data.timezone); }
    if (data.timeOn !== undefined)      { fields.push(`"timeOn" = $${idx++}`);          values.push(data.timeOn); }
    if (data.timeOff !== undefined)     { fields.push(`"timeOff" = $${idx++}`);         values.push(data.timeOff); }
    if (data.deployDate !== undefined)  { fields.push(`"deployDate" = $${idx++}`);      values.push(data.deployDate); }
    if (data.endDate !== undefined)     { fields.push(`"endDate" = $${idx++}`);         values.push(data.endDate); }
    if (data.playlistId !== undefined)  { fields.push(`"playlistId" = $${idx++}`);      values.push(data.playlistId); }

    if (fields.length === 0) throw new AppError(400, 'Không có dữ liệu để cập nhật');
    fields.push(`"updatedAt" = NOW()`);
    values.push(id, organizationId);

    let row: { id: string } | null;
    try {
        row = await queryOne<{ id: string }>(
            `UPDATE stores SET ${fields.join(', ')}
             WHERE id = $${idx++} AND "organizationId" = $${idx++}
             RETURNING id`,
            values,
        );
    } catch (err) {
        handleUniqueViolation(err, 'Tên site đã tồn tại trong tổ chức');
    }
    if (!row!) throw new AppError(404, 'Site không tồn tại');

    // Auto-sync: when playlistId is set, recompute startEpoch so devices sync immediately.
    // When playlistId is cleared, stop the sync clock.
    if (data.playlistId !== undefined) {
        if (data.playlistId) {
            await startSite(id, organizationId).catch(() => { /* playlist may be empty — ignore */ });
        } else {
            await query(
                `UPDATE stores SET "startEpoch" = NULL, "totalDurationMs" = NULL, "updatedAt" = NOW() WHERE id = $1`,
                [id],
            );
        }
    }

    return getSiteById(id, organizationId);
}

// ─── Delete ───────────────────────────────────────────────────────────────────

export async function deleteSite(id: string, organizationId: string) {
    await query(
        `UPDATE devices SET "storeId" = NULL WHERE "storeId" = $1`, [id],
    );
    const res = await queryOne<{ id: string }>(
        `DELETE FROM stores WHERE id = $1 AND "organizationId" = $2 RETURNING id`,
        [id, organizationId],
    );
    if (!res) throw new AppError(404, 'Site không tồn tại');
    logger.info('Site deleted', { id, organizationId });
}

// ─── Start / Restart / Stop ───────────────────────────────────────────────────

export async function startSite(id: string, organizationId: string) {
    const site = await queryOne<{ playlistId: string | null }>(
        `SELECT "playlistId" FROM stores WHERE id = $1 AND "organizationId" = $2`,
        [id, organizationId],
    );
    if (!site) throw new AppError(404, 'Site không tồn tại');
    if (!site.playlistId) throw new AppError(400, 'Site chưa có playlist — hãy gán playlist trước');

    const items = await query<{ durationOverride: number | null; duration: number | null; transitionDuration: number | null }>(
        `SELECT pi."durationOverride", pi."transitionDuration", m.duration
         FROM playlist_items pi
         LEFT JOIN media m ON m.id = pi."mediaId"
         WHERE pi."playlistId" = $1
         ORDER BY pi.position ASC`,
        [site.playlistId],
    );
    if (items.length === 0) throw new AppError(400, 'Playlist không có media nào');

    // totalDurationMs = sum(itemDuration + transitionDuration) — each transition belongs to
    // the GAP between item i ending and item i+1 starting (uses item i+1's transitionDuration).
    // Item 0's transition is used on wrap-around (end of cycle back to item 0).
    const DEFAULT_TRANS_MS = 800;
    const totalDurationMs = items.reduce((sum, item, idx) => {
        const dur = (item.durationOverride != null && item.durationOverride > 0
            ? item.durationOverride : (item.duration ?? 10)) * 1000;
        const nextItem = items[(idx + 1) % items.length];
        const trans = nextItem.transitionDuration ?? DEFAULT_TRANS_MS;
        return sum + dur + trans;
    }, 0);

    const startEpoch = Date.now();

    await query(
        `UPDATE stores
         SET "startEpoch" = $1, "totalDurationMs" = $2, "updatedAt" = NOW()
         WHERE id = $3`,
        [startEpoch, totalDurationMs, id],
    );

    logger.info('Site sync started', { id, startEpoch, totalDurationMs });
    // Notify all devices in this org so they re-sync and pick up the new startEpoch
    await invalidateContentHashForOrg(organizationId);
    broadcastContentUpdate(organizationId, 'schedule.update');
    return { id, startEpoch, totalDurationMs, playlistId: site.playlistId };
}

export async function stopSite(id: string, organizationId: string) {
    const res = await queryOne<{ id: string }>(
        `UPDATE stores SET "startEpoch" = NULL, "updatedAt" = NOW()
         WHERE id = $1 AND "organizationId" = $2 RETURNING id`,
        [id, organizationId],
    );
    if (!res) throw new AppError(404, 'Site không tồn tại');
    logger.info('Site sync stopped', { id });
    await invalidateContentHashForOrg(organizationId);
    broadcastContentUpdate(organizationId, 'schedule.update');
}

// ─── Assign / remove devices ──────────────────────────────────────────────────

export async function updateSiteDevices(
    id: string,
    organizationId: string,
    data: UpdateSiteDevices,
) {
    const site = await queryOne<{ id: string }>(
        `SELECT id FROM stores WHERE id = $1 AND "organizationId" = $2`,
        [id, organizationId],
    );
    if (!site) throw new AppError(404, 'Site không tồn tại');

    if (data.add && data.add.length > 0) {
        // Reject if any device already belongs to a different site (skip when forceTransfer)
        if (!data.forceTransfer) {
            const conflicts = await query<{ name: string; siteName: string }>(
                `SELECT d.name, s.name AS "siteName"
                 FROM devices d
                 JOIN stores s ON s.id = d."storeId"
                 WHERE d.id = ANY($1::text[])
                   AND d."organizationId" = $2
                   AND d."storeId" IS NOT NULL
                   AND d."storeId" <> $3`,
                [data.add, organizationId, id],
            );
            if (conflicts.length > 0) {
                const list = conflicts.map(c => `"${c.name}" (đang ở site "${c.siteName}")`).join(', ');
                throw new AppError(409, `Device đã thuộc site khác: ${list}`);
            }
        } else {
            // forceTransfer: detach devices from their current site before re-assigning
            await query(
                `UPDATE devices SET "storeId" = NULL, role = 'STANDALONE', "updatedAt" = NOW()
                 WHERE id = ANY($1::text[]) AND "organizationId" = $2 AND "storeId" <> $3`,
                [data.add, organizationId, id],
            );
        }

        // Check if site currently has a MASTER
        const existing = await queryOne<{ hasMaster: boolean; count: string }>(
            `SELECT COUNT(*) AS count,
                    BOOL_OR(role = 'MASTER') AS "hasMaster"
             FROM devices WHERE "storeId" = $1`,
            [id],
        );
        const hasMaster = existing?.hasMaster ?? false;

        // First device added to empty site → MASTER; all others → SLAVE
        const addIds = data.add;
        if (!hasMaster && addIds.length > 0) {
            // First in the list becomes MASTER
            await query(
                `UPDATE devices SET "storeId" = $1, role = 'MASTER', "updatedAt" = NOW()
                 WHERE id = $2 AND "organizationId" = $3`,
                [id, addIds[0], organizationId],
            );
            if (addIds.length > 1) {
                await query(
                    `UPDATE devices SET "storeId" = $1, role = 'SLAVE', "updatedAt" = NOW()
                     WHERE id = ANY($2::text[]) AND "organizationId" = $3`,
                    [id, addIds.slice(1), organizationId],
                );
            }
        } else {
            // Site already has a MASTER — all new devices are SLAVE
            await query(
                `UPDATE devices SET "storeId" = $1, role = 'SLAVE', "updatedAt" = NOW()
                 WHERE id = ANY($2::text[]) AND "organizationId" = $3`,
                [id, addIds, organizationId],
            );
        }
    }

    if (data.remove && data.remove.length > 0) {
        // Check if MASTER is being removed
        const removingMaster = await queryOne<{ id: string }>(
            `SELECT id FROM devices
             WHERE id = ANY($1::text[]) AND "storeId" = $2 AND role = 'MASTER'`,
            [data.remove, id],
        );

        await query(
            `UPDATE devices SET "storeId" = NULL, role = 'STANDALONE', "updatedAt" = NOW()
             WHERE id = ANY($1::text[]) AND "storeId" = $2 AND "organizationId" = $3`,
            [data.remove, id, organizationId],
        );

        // Promote first remaining SLAVE to MASTER if MASTER was removed
        if (removingMaster) {
            await query(
                `UPDATE devices SET role = 'MASTER', "updatedAt" = NOW()
                 WHERE id = (
                     SELECT id FROM devices
                     WHERE "storeId" = $1 AND role = 'SLAVE'
                     ORDER BY "createdAt" ASC
                     LIMIT 1
                 )`,
                [id],
            );
        }
    }

    // Notify affected devices to re-sync (role changed, storeId changed)
    await invalidateContentHashForOrg(organizationId);
    broadcastContentUpdate(organizationId, 'schedule.update');
    return getSiteById(id, organizationId);
}
