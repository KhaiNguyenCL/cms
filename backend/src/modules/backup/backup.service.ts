import { PoolClient } from 'pg';
import { query, queryOne, withTransaction } from '../../shared/database/db';
import { AppError } from '../../shared/middleware/error.middleware';
import { invalidateContentHashForOrg } from '../device-sync/device-sync.service';
import logger from '../../shared/utils/logger';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BackupRow {
    id: string;
    organizationId: string;
    label: string;
    type: 'MANUAL' | 'AUTO';
    createdBy: string | null;
    createdAt: string;
    /** snapshot is NOT returned in list — only on GET single */
    snapshot?: unknown;
}

export const BACKUP_PLANS = [3, 7, 10] as const;
export type BackupPlanDays = typeof BACKUP_PLANS[number];

export interface BackupPlanRequest {
    id: string;
    organizationId: string;
    orgName?: string;
    requestedPlan: number;
    status: 'PENDING' | 'APPROVED' | 'REJECTED';
    note: string | null;
    adminNote: string | null;
    requestedById: string | null;
    requestedByName: string | null;
    resolvedById: string | null;
    resolvedAt: string | null;
    createdAt: string;
}

interface SnapshotV1 {
    version: 1;
    snapshotAt: string;
    sites: unknown[];
    deviceGroups: unknown[];
    deviceGroupMembers: unknown[];
    devices: unknown[];
    deviceComments: unknown[];
    media: unknown[];
    playlists: unknown[];
    playlistItems: unknown[];
    schedules: unknown[];
    scheduleAssignments: unknown[];
}

// ─── Snapshot builder ─────────────────────────────────────────────────────────

async function buildSnapshot(orgId: string): Promise<SnapshotV1> {
    const [
        sites,
        deviceGroups,
        deviceGroupMembers,
        devices,
        deviceComments,
        media,
        playlists,
        playlistItems,
        schedules,
        scheduleAssignments,
    ] = await Promise.all([
        query(`SELECT row_to_json(s.*) AS r FROM stores s WHERE "organizationId" = $1`, [orgId]).then(rows => rows.map((r: any) => r.r)),
        query(`SELECT row_to_json(g.*) AS r FROM device_groups g WHERE "organizationId" = $1`, [orgId]).then(rows => rows.map((r: any) => r.r)),
        query(`SELECT row_to_json(m.*) AS r FROM device_group_members m
               WHERE "groupId" IN (SELECT id FROM device_groups WHERE "organizationId" = $1)`, [orgId]).then(rows => rows.map((r: any) => r.r)),
        query(`SELECT row_to_json(d.*) AS r FROM devices d WHERE "organizationId" = $1`, [orgId]).then(rows => rows.map((r: any) => r.r)),
        query(`SELECT row_to_json(c.*) AS r FROM device_comments c WHERE "organizationId" = $1`, [orgId]).then(rows => rows.map((r: any) => r.r)),
        query(`SELECT row_to_json(m.*) AS r FROM media m WHERE "organizationId" = $1`, [orgId]).then(rows => rows.map((r: any) => r.r)),
        query(`SELECT row_to_json(p.*) AS r FROM playlists p WHERE "organizationId" = $1`, [orgId]).then(rows => rows.map((r: any) => r.r)),
        query(`SELECT row_to_json(i.*) AS r FROM playlist_items i
               WHERE "playlistId" IN (SELECT id FROM playlists WHERE "organizationId" = $1)`, [orgId]).then(rows => rows.map((r: any) => r.r)),
        query(`SELECT row_to_json(s.*) AS r FROM schedules s WHERE "organizationId" = $1`, [orgId]).then(rows => rows.map((r: any) => r.r)),
        query(`SELECT row_to_json(sa.*) AS r FROM schedule_assignments sa WHERE "organizationId" = $1`, [orgId]).then(rows => rows.map((r: any) => r.r)),
    ]);

    return {
        version: 1,
        snapshotAt: new Date().toISOString(),
        sites,
        deviceGroups,
        deviceGroupMembers,
        devices,
        deviceComments,
        media,
        playlists,
        playlistItems,
        schedules,
        scheduleAssignments,
    };
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export async function listBackups(orgId: string): Promise<BackupRow[]> {
    return query<BackupRow>(
        `SELECT id, "organizationId", label, type, "createdBy", "createdAt"
         FROM org_backups
         WHERE "organizationId" = $1
         ORDER BY "createdAt" DESC`,
        [orgId]
    );
}

export async function createBackup(
    orgId: string,
    userId: string | null,
    label?: string,
    type: 'MANUAL' | 'AUTO' = 'MANUAL',
): Promise<BackupRow> {
    const snapshot = await buildSnapshot(orgId);
    const defaultLabel = type === 'AUTO'
        ? `Auto ${new Date().toLocaleDateString('vi-VN')}`
        : `Backup ${new Date().toLocaleString('vi-VN')}`;

    const row = await queryOne<BackupRow>(
        `INSERT INTO org_backups ("organizationId", label, type, snapshot, "createdBy")
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, "organizationId", label, type, "createdBy", "createdAt"`,
        [orgId, label ?? defaultLabel, type, JSON.stringify(snapshot), userId]
    );
    return row!;
}

export async function deleteBackup(orgId: string, id: string): Promise<void> {
    const existing = await queryOne(
        `SELECT id FROM org_backups WHERE id = $1 AND "organizationId" = $2`,
        [id, orgId]
    );
    if (!existing) throw new AppError(404, 'Backup not found');
    await query(`DELETE FROM org_backups WHERE id = $1`, [id]);
}

// ─── AUTO cleanup: keep max 7 AUTO snapshots per org ─────────────────────────

export async function cleanupAutoBackups(orgId: string, keepCount = 7): Promise<void> {
    await query(
        `DELETE FROM org_backups
         WHERE "organizationId" = $1
           AND type = 'AUTO'
           AND id NOT IN (
               SELECT id FROM org_backups
               WHERE "organizationId" = $1 AND type = 'AUTO'
               ORDER BY "createdAt" DESC
               LIMIT $2
           )`,
        [orgId, keepCount]
    );
}

// ─── Restore ──────────────────────────────────────────────────────────────────

export async function restoreBackup(orgId: string, id: string, requesterId: string): Promise<void> {
    const backupRow = await queryOne<{ snapshot: SnapshotV1 }>(
        `SELECT snapshot FROM org_backups WHERE id = $1 AND "organizationId" = $2`,
        [id, orgId]
    );
    if (!backupRow) throw new AppError(404, 'Backup not found');
    const snapshot = backupRow.snapshot;

    if (snapshot.version !== 1) {
        throw new AppError(400, `Unsupported snapshot version: ${snapshot.version}`);
    }

    await withTransaction(async (client: PoolClient) => {
        // ── Step 0: capture current device license state ─────────────────────
        const licenseRows = await client.query(
            `SELECT id, "isLicensed", "licenseStartDate", "licenseEndDate"
             FROM devices WHERE "organizationId" = $1`,
            [orgId]
        );
        const licenseMap = new Map<string, { isLicensed: boolean; licenseStartDate: string | null; licenseEndDate: string | null }>();
        for (const r of licenseRows.rows) {
            licenseMap.set(r.id, {
                isLicensed: r.isLicensed,
                licenseStartDate: r.licenseStartDate,
                licenseEndDate: r.licenseEndDate,
            });
        }

        // Collect IDs present in snapshot (to scope deletes — items NOT in snapshot are kept)
        const snapshotDeviceIds = (snapshot.devices as any[]).map((d: any) => d.id);
        const snapshotMediaIds  = (snapshot.media as any[]).map((m: any) => m.id);

        // ── Step 1: delete phase (reverse FK order) ────────────────────────
        await client.query(`DELETE FROM schedule_assignments WHERE "organizationId" = $1`, [orgId]);
        await client.query(`DELETE FROM schedules WHERE "organizationId" = $1`, [orgId]);
        await client.query(
            `DELETE FROM playlist_items WHERE "playlistId" IN (SELECT id FROM playlists WHERE "organizationId" = $1)`,
            [orgId]
        );
        await client.query(`DELETE FROM playlists WHERE "organizationId" = $1`, [orgId]);

        // Soft-delete only media IN the snapshot — new media (post-snapshot) stays active
        if (snapshotMediaIds.length > 0) {
            await client.query(
                `UPDATE media SET "deletedAt" = NOW()
                 WHERE "organizationId" = $1 AND "deletedAt" IS NULL AND id = ANY($2::text[])`,
                [orgId, snapshotMediaIds]
            );
        }

        await client.query(`DELETE FROM device_comments WHERE "organizationId" = $1`, [orgId]);
        await client.query(
            `DELETE FROM device_group_members WHERE "groupId" IN (SELECT id FROM device_groups WHERE "organizationId" = $1)`,
            [orgId]
        );
        await client.query(`DELETE FROM device_groups WHERE "organizationId" = $1`, [orgId]);

        // Soft-delete only devices IN the snapshot — devices added after snapshot stay active
        if (snapshotDeviceIds.length > 0) {
            await client.query(
                `UPDATE devices SET "deletedAt" = NOW()
                 WHERE "organizationId" = $1 AND "deletedAt" IS NULL AND id = ANY($2::text[])`,
                [orgId, snapshotDeviceIds]
            );
        }

        // Hard-delete stores (sites) — no files or JWTs to preserve
        await client.query(`DELETE FROM stores WHERE "organizationId" = $1`, [orgId]);

        // ── Step 2: insert phase (correct FK order) ────────────────────────

        // 2a. stores (without playlistId to avoid circular FK — patched at end)
        if (snapshot.sites.length > 0) {
            const sitesWithoutPlaylist = snapshot.sites.map((s: any) => ({ ...s, playlistId: null }));
            await client.query(
                `INSERT INTO stores
                 SELECT * FROM json_populate_recordset(null::stores, $1::json)
                 ON CONFLICT (id) DO UPDATE SET
                   name = EXCLUDED.name, description = EXCLUDED.description,
                   address = EXCLUDED.address, contact = EXCLUDED.contact,
                   "startEpoch" = EXCLUDED."startEpoch", "totalDurationMs" = EXCLUDED."totalDurationMs",
                   "updatedAt" = EXCLUDED."updatedAt"`,
                [JSON.stringify(sitesWithoutPlaylist)]
            );
        }

        // 2b. device_groups
        if (snapshot.deviceGroups.length > 0) {
            await client.query(
                `INSERT INTO device_groups
                 SELECT * FROM json_populate_recordset(null::device_groups, $1::json)
                 ON CONFLICT (id) DO UPDATE SET
                   name = EXCLUDED.name, description = EXCLUDED.description,
                   "updatedAt" = EXCLUDED."updatedAt"`,
                [JSON.stringify(snapshot.deviceGroups)]
            );
        }

        // 2c. devices (depends on stores for storeId)
        if (snapshot.devices.length > 0) {
            await client.query(
                `INSERT INTO devices
                 SELECT * FROM json_populate_recordset(null::devices, $1::json)
                 ON CONFLICT (id) DO UPDATE SET
                   name = EXCLUDED.name, location = EXCLUDED.location, timezone = EXCLUDED.timezone,
                   "pairingCode" = EXCLUDED."pairingCode", "androidId" = EXCLUDED."androidId",
                   model = EXCLUDED.model, "osVersion" = EXCLUDED."osVersion", "appVersion" = EXCLUDED."appVersion",
                   status = EXCLUDED.status, "lastSeen" = EXCLUDED."lastSeen",
                   "lastOnlineAt" = EXCLUDED."lastOnlineAt", "lastOfflineAt" = EXCLUDED."lastOfflineAt",
                   settings = EXCLUDED.settings, role = EXCLUDED.role,
                   "downloadStatus" = EXCLUDED."downloadStatus", "contentReady" = EXCLUDED."contentReady",
                   "storeId" = EXCLUDED."storeId", "deletedAt" = EXCLUDED."deletedAt",
                   "isLicensed" = EXCLUDED."isLicensed",
                   "licenseStartDate" = EXCLUDED."licenseStartDate",
                   "licenseEndDate" = EXCLUDED."licenseEndDate",
                   "updatedAt" = EXCLUDED."updatedAt"`,
                [JSON.stringify(snapshot.devices)]
            );

            // Restore current license values (overwrite snapshot values)
            for (const [deviceId, lic] of licenseMap) {
                await client.query(
                    `UPDATE devices SET "isLicensed" = $2, "licenseStartDate" = $3, "licenseEndDate" = $4
                     WHERE id = $1`,
                    [deviceId, lic.isLicensed, lic.licenseStartDate, lic.licenseEndDate]
                );
            }
        }

        // 2d. device_group_members
        if (snapshot.deviceGroupMembers.length > 0) {
            await client.query(
                `INSERT INTO device_group_members
                 SELECT * FROM json_populate_recordset(null::device_group_members, $1::json)
                 ON CONFLICT DO NOTHING`,
                [JSON.stringify(snapshot.deviceGroupMembers)]
            );
        }

        // 2e. device_comments
        if (snapshot.deviceComments.length > 0) {
            await client.query(
                `INSERT INTO device_comments
                 SELECT * FROM json_populate_recordset(null::device_comments, $1::json)
                 ON CONFLICT (id) DO UPDATE SET comment = EXCLUDED.comment`,
                [JSON.stringify(snapshot.deviceComments)]
            );
        }

        // 2f. media (undelete from snapshot — preserve rows that exist in snapshot)
        if (snapshot.media.length > 0) {
            await client.query(
                `INSERT INTO media
                 SELECT * FROM json_populate_recordset(null::media, $1::json)
                 ON CONFLICT (id) DO UPDATE SET
                   title = EXCLUDED.title, description = EXCLUDED.description,
                   "filePath" = EXCLUDED."filePath", "fileSize" = EXCLUDED."fileSize",
                   "mimeType" = EXCLUDED."mimeType", "fileHash" = EXCLUDED."fileHash",
                   duration = EXCLUDED.duration, width = EXCLUDED.width, height = EXCLUDED.height,
                   "thumbnailPath" = EXCLUDED."thumbnailPath", tags = EXCLUDED.tags,
                   metadata = EXCLUDED.metadata, status = EXCLUDED.status,
                   "deletedAt" = EXCLUDED."deletedAt", "updatedAt" = EXCLUDED."updatedAt"`,
                [JSON.stringify(snapshot.media)]
            );
        }

        // 2g. playlists
        if (snapshot.playlists.length > 0) {
            await client.query(
                `INSERT INTO playlists
                 SELECT * FROM json_populate_recordset(null::playlists, $1::json)
                 ON CONFLICT (id) DO UPDATE SET
                   name = EXCLUDED.name, description = EXCLUDED.description,
                   "isDefault" = EXCLUDED."isDefault", "updatedAt" = EXCLUDED."updatedAt"`,
                [JSON.stringify(snapshot.playlists)]
            );
        }

        // 2h. playlist_items
        if (snapshot.playlistItems.length > 0) {
            await client.query(
                `INSERT INTO playlist_items
                 SELECT * FROM json_populate_recordset(null::playlist_items, $1::json)
                 ON CONFLICT (id) DO UPDATE SET
                   position = EXCLUDED.position, "durationOverride" = EXCLUDED."durationOverride",
                   transition = EXCLUDED.transition, "transitionDuration" = EXCLUDED."transitionDuration"`,
                [JSON.stringify(snapshot.playlistItems)]
            );
        }

        // 2i. schedules
        if (snapshot.schedules.length > 0) {
            await client.query(
                `INSERT INTO schedules
                 SELECT * FROM json_populate_recordset(null::schedules, $1::json)
                 ON CONFLICT (id) DO UPDATE SET
                   name = EXCLUDED.name, "playlistId" = EXCLUDED."playlistId",
                   "targetType" = EXCLUDED."targetType",
                   "targetDeviceId" = EXCLUDED."targetDeviceId", "targetGroupId" = EXCLUDED."targetGroupId",
                   "startDate" = EXCLUDED."startDate", "endDate" = EXCLUDED."endDate",
                   "startTime" = EXCLUDED."startTime", "endTime" = EXCLUDED."endTime",
                   "daysOfWeek" = EXCLUDED."daysOfWeek", priority = EXCLUDED.priority,
                   "isActive" = EXCLUDED."isActive", "updatedAt" = EXCLUDED."updatedAt"`,
                [JSON.stringify(snapshot.schedules)]
            );
        }

        // 2j. schedule_assignments
        if (snapshot.scheduleAssignments.length > 0) {
            await client.query(
                `INSERT INTO schedule_assignments
                 SELECT * FROM json_populate_recordset(null::schedule_assignments, $1::json)
                 ON CONFLICT (id) DO UPDATE SET
                   "targetType" = EXCLUDED."targetType", "targetId" = EXCLUDED."targetId",
                   "sortOrder" = EXCLUDED."sortOrder"`,
                [JSON.stringify(snapshot.scheduleAssignments)]
            );
        }

        // 2k. patch stores.playlistId (restore FK after playlists inserted)
        for (const site of snapshot.sites as any[]) {
            if (site.playlistId) {
                await client.query(
                    `UPDATE stores SET "playlistId" = $2 WHERE id = $1`,
                    [site.id, site.playlistId]
                );
            }
        }

        logger.info('Restore completed', { orgId, backupId: id, requesterId });
    });

    // Invalidate content hash so all devices re-sync
    await invalidateContentHashForOrg(orgId, 'CONTENT').catch(() => {});
}

// ─── Backup Plan (purchase request flow) ──────────────────────────────────────

export async function getOrgBackupPlan(orgId: string): Promise<{ backupPlan: number | null }> {
    const row = await queryOne<{ backupPlan: number | null }>(
        `SELECT "backupPlan" FROM organizations WHERE id = $1`, [orgId]
    );
    if (!row) throw new AppError(404, 'Organization not found');
    return { backupPlan: row.backupPlan };
}

export async function requestBackupPlan(
    orgId: string,
    requestedById: string,
    requestedByName: string,
    requestedPlan: number,
    note?: string,
): Promise<BackupPlanRequest> {
    if (!BACKUP_PLANS.includes(requestedPlan as BackupPlanDays)) {
        throw new AppError(400, 'Gói backup không hợp lệ. Chọn 3, 7 hoặc 10 ngày.');
    }
    // Check for existing PENDING request
    const pending = await queryOne(
        `SELECT id FROM backup_plan_requests WHERE "organizationId" = $1 AND status = 'PENDING'`,
        [orgId]
    );
    if (pending) throw new AppError(409, 'Đã có yêu cầu đang chờ xử lý');

    const row = await queryOne<BackupPlanRequest>(
        `INSERT INTO backup_plan_requests
           ("organizationId", "requestedPlan", note, "requestedById", "requestedByName")
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *, '' AS "orgName"`,
        [orgId, requestedPlan, note ?? null, requestedById, requestedByName]
    );
    if (!row) throw new AppError(500, 'Tạo yêu cầu thất bại');

    // Notify super admins
    import('../../modules/notifications/notifications.service')
        .then(async ({ createNotification, getSuperAdminOrgIds, NOTIF_TYPES }) => {
            const orgRow = await queryOne<{ name: string }>(`SELECT name FROM organizations WHERE id = $1`, [orgId]);
            const orgIds = await getSuperAdminOrgIds();
            await Promise.all(orgIds.map(adminOrgId =>
                createNotification(
                    adminOrgId,
                    NOTIF_TYPES.STORAGE_REQUEST_NEW,
                    `Yêu cầu gói backup mới`,
                    `${orgRow?.name ?? orgId}: gói ${requestedPlan} ngày`,
                    row!.id, 'backup_plan_request',
                )
            ));
        }).catch(() => {});

    return row;
}

export async function listPlanRequests(status?: string): Promise<BackupPlanRequest[]> {
    const where = status ? `WHERE bpr.status = $1` : '';
    const vals = status ? [status] : [];
    return query<BackupPlanRequest>(
        `SELECT bpr.*, o.name AS "orgName"
         FROM backup_plan_requests bpr
         JOIN organizations o ON o.id = bpr."organizationId"
         ${where}
         ORDER BY bpr."createdAt" DESC`,
        vals
    );
}

export async function listOwnPlanRequests(orgId: string): Promise<BackupPlanRequest[]> {
    return query<BackupPlanRequest>(
        `SELECT *, '' AS "orgName"
         FROM backup_plan_requests
         WHERE "organizationId" = $1
         ORDER BY "createdAt" DESC`,
        [orgId]
    );
}

export async function approvePlanRequest(
    requestId: string,
    performedById: string,
    adminNote?: string,
): Promise<BackupPlanRequest> {
    const req = await queryOne<{ organizationId: string; requestedPlan: number; status: string }>(
        `SELECT "organizationId", "requestedPlan", status FROM backup_plan_requests WHERE id = $1`,
        [requestId]
    );
    if (!req) throw new AppError(404, 'Yêu cầu không tồn tại');
    if (req.status !== 'PENDING') throw new AppError(409, 'Yêu cầu đã được xử lý');

    await withTransaction(async (client) => {
        await client.query(
            `UPDATE organizations SET "backupPlan" = $2, "updatedAt" = NOW() WHERE id = $1`,
            [req.organizationId, req.requestedPlan]
        );
        await client.query(
            `UPDATE backup_plan_requests
             SET status = 'APPROVED', "adminNote" = $1, "resolvedById" = $2, "resolvedAt" = NOW()
             WHERE id = $3`,
            [adminNote ?? null, performedById, requestId]
        );
    });

    import('../../modules/notifications/notifications.service')
        .then(({ createNotification, NOTIF_TYPES }) =>
            createNotification(req.organizationId, NOTIF_TYPES.STORAGE_REQUEST_APPROVED,
                `Gói backup đã được duyệt`,
                `Gói ${req.requestedPlan} ngày${adminNote ? ` — ${adminNote}` : ''}`,
                requestId, 'backup_plan_request')
        ).catch(() => {});

    logger.info('Backup plan request approved', { requestId, orgId: req.organizationId, plan: req.requestedPlan });

    const updated = await queryOne<BackupPlanRequest>(
        `SELECT bpr.*, o.name AS "orgName"
         FROM backup_plan_requests bpr JOIN organizations o ON o.id = bpr."organizationId"
         WHERE bpr.id = $1`, [requestId]
    );
    return updated!;
}

export async function rejectPlanRequest(
    requestId: string,
    performedById: string,
    adminNote?: string,
): Promise<BackupPlanRequest> {
    const req = await queryOne<{ organizationId: string; requestedPlan: number; status: string }>(
        `SELECT "organizationId", "requestedPlan", status FROM backup_plan_requests WHERE id = $1`,
        [requestId]
    );
    if (!req) throw new AppError(404, 'Yêu cầu không tồn tại');
    if (req.status !== 'PENDING') throw new AppError(409, 'Yêu cầu đã được xử lý');

    await query(
        `UPDATE backup_plan_requests
         SET status = 'REJECTED', "adminNote" = $1, "resolvedById" = $2, "resolvedAt" = NOW()
         WHERE id = $3`,
        [adminNote ?? null, performedById, requestId]
    );

    import('../../modules/notifications/notifications.service')
        .then(({ createNotification, NOTIF_TYPES }) =>
            createNotification(req.organizationId, NOTIF_TYPES.STORAGE_REQUEST_REJECTED,
                `Gói backup bị từ chối`,
                `Gói ${req.requestedPlan} ngày${adminNote ? ` — ${adminNote}` : ''}`,
                requestId, 'backup_plan_request')
        ).catch(() => {});

    logger.info('Backup plan request rejected', { requestId, orgId: req.organizationId });

    const updated = await queryOne<BackupPlanRequest>(
        `SELECT bpr.*, o.name AS "orgName"
         FROM backup_plan_requests bpr JOIN organizations o ON o.id = bpr."organizationId"
         WHERE bpr.id = $1`, [requestId]
    );
    return updated!;
}
