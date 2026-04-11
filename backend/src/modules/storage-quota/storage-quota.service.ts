import { query, queryOne, withTransaction } from '../../shared/database/db';
import { AppError } from '../../shared/middleware/error.middleware';
import logger from '../../shared/utils/logger';
import type { PurchaseRequestBody, AdjustPoolBody, ResolveRequestBody } from './storage-quota.schema';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StoragePool {
    storageBaseMb: number;
    ext50mb: number;
    ext100mb: number;
    ext200mb: number;
    totalQuotaMb: number;   // computed
}

export interface StorageUsage extends StoragePool {
    usedBytes: number;
    usedMb: number;
    totalQuotaBytes: number;
    percentUsed: number;
}

export interface StoragePurchaseRequest {
    id: string;
    organizationId: string;
    orgName: string;
    packageMb: number;
    quantity: number;
    totalMb: number;
    status: string;
    note: string | null;
    adminNote: string | null;
    requestedById: string | null;
    requestedByName: string | null;
    resolvedById: string | null;
    resolvedAt: string | null;
    createdAt: string;
}

export interface OrgStorageStat {
    id: string;
    name: string;
    slug: string;
    storageBaseMb: number;
    ext50mb: number;
    ext100mb: number;
    ext200mb: number;
    totalQuotaMb: number;
    usedBytes: number;
    pendingRequests: number;
}

function calcTotalMb(baseMb: number, ext50: number, ext100: number, ext200: number): number {
    return baseMb + ext50 * 50 + ext100 * 100 + ext200 * 200;
}

// ─── Org-facing ───────────────────────────────────────────────────────────────

export async function getStorageUsage(organizationId: string): Promise<StorageUsage> {
    const row = await queryOne<{
        storageBaseMb: number; ext50mb: number; ext100mb: number; ext200mb: number;
        usedBytes: string;
    }>(
        `SELECT "storageBaseMb", "ext50mb", "ext100mb", "ext200mb",
                COALESCE((SELECT SUM("fileSize") FROM media WHERE "organizationId" = $1), 0)::text AS "usedBytes"
         FROM organizations WHERE id = $1`,
        [organizationId]
    );
    if (!row) throw new AppError(404, 'Tổ chức không tồn tại');

    const totalQuotaMb = calcTotalMb(row.storageBaseMb, row.ext50mb, row.ext100mb, row.ext200mb);
    const usedBytes = parseInt(row.usedBytes);
    const totalQuotaBytes = totalQuotaMb * 1024 * 1024;

    return {
        storageBaseMb: row.storageBaseMb,
        ext50mb: row.ext50mb,
        ext100mb: row.ext100mb,
        ext200mb: row.ext200mb,
        totalQuotaMb,
        usedBytes,
        usedMb: Math.round(usedBytes / (1024 * 1024) * 100) / 100,
        totalQuotaBytes,
        percentUsed: totalQuotaBytes > 0 ? Math.round((usedBytes / totalQuotaBytes) * 100) : 0,
    };
}

export async function createPurchaseRequest(
    organizationId: string,
    requestedById: string,
    requestedByName: string,
    data: PurchaseRequestBody,
): Promise<StoragePurchaseRequest> {
    const row = await queryOne<StoragePurchaseRequest>(
        `INSERT INTO storage_purchase_requests
           (id, "organizationId", "packageMb", quantity, note, "requestedById", "requestedByName", "createdAt")
         VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, NOW())
         RETURNING *, '' AS "orgName"`,
        [organizationId, data.packageMb, data.quantity, data.note ?? null, requestedById, requestedByName]
    );
    if (!row) throw new AppError(500, 'Tạo yêu cầu thất bại');
    logger.info('Storage purchase request created', { organizationId, packageMb: data.packageMb, quantity: data.quantity });

    // Notify all super admin orgs
    import('../../modules/notifications/notifications.service')
        .then(async ({ createNotification, getSuperAdminOrgIds, NOTIF_TYPES }) => {
            const orgRow = await queryOne<{ name: string }>(`SELECT name FROM organizations WHERE id = $1`, [organizationId]);
            const orgIds = await getSuperAdminOrgIds();
            await Promise.all(orgIds.map(adminOrgId =>
                createNotification(
                    adminOrgId,
                    NOTIF_TYPES.STORAGE_REQUEST_NEW,
                    `Yêu cầu mua dung lượng mới`,
                    `${orgRow?.name ?? organizationId}: +${data.packageMb * data.quantity} MB`,
                    row!.id, 'storage_request',
                )
            ));
        }).catch(() => {});

    return { ...row, totalMb: data.packageMb * data.quantity };
}

export async function listOwnRequests(organizationId: string): Promise<StoragePurchaseRequest[]> {
    return query<StoragePurchaseRequest>(
        `SELECT id, "organizationId", '' AS "orgName", "packageMb", quantity,
                ("packageMb" * quantity) AS "totalMb",
                status, note, "adminNote", "requestedById", "requestedByName",
                "resolvedById", "resolvedAt", "createdAt"
         FROM storage_purchase_requests
         WHERE "organizationId" = $1
         ORDER BY "createdAt" DESC`,
        [organizationId]
    );
}

// ─── Platform (Super Admin) ───────────────────────────────────────────────────

export async function getAllOrgStorageStats(): Promise<OrgStorageStat[]> {
    return query<OrgStorageStat>(
        `SELECT o.id, o.name, o.slug,
                o."storageBaseMb", o."ext50mb", o."ext100mb", o."ext200mb",
                (o."storageBaseMb" + o."ext50mb"*50 + o."ext100mb"*100 + o."ext200mb"*200) AS "totalQuotaMb",
                COALESCE(SUM(m."fileSize"), 0)::bigint AS "usedBytes",
                COUNT(spr.id) FILTER (WHERE spr.status = 'PENDING')::int AS "pendingRequests"
         FROM organizations o
         LEFT JOIN media m  ON m."organizationId" = o.id
         LEFT JOIN storage_purchase_requests spr ON spr."organizationId" = o.id
         GROUP BY o.id
         ORDER BY o.name`
    );
}

export async function adjustPool(
    organizationId: string,
    data: AdjustPoolBody,
    performedById: string,
    performedByName: string,
): Promise<StoragePool> {
    const fields: string[] = [];
    const vals: unknown[]  = [];
    let idx = 1;

    if (data.storageBaseMb !== undefined) { fields.push(`"storageBaseMb" = $${idx++}`); vals.push(data.storageBaseMb); }
    if (data.delta50mb  !== undefined) { fields.push(`"ext50mb"  = GREATEST(0, "ext50mb"  + $${idx++})`); vals.push(data.delta50mb); }
    if (data.delta100mb !== undefined) { fields.push(`"ext100mb" = GREATEST(0, "ext100mb" + $${idx++})`); vals.push(data.delta100mb); }
    if (data.delta200mb !== undefined) { fields.push(`"ext200mb" = GREATEST(0, "ext200mb" + $${idx++})`); vals.push(data.delta200mb); }
    if (fields.length === 0) throw new AppError(400, 'Không có thay đổi');

    vals.push(organizationId);
    const row = await queryOne<StoragePool>(
        `UPDATE organizations
         SET ${fields.join(', ')}, "updatedAt" = NOW()
         WHERE id = $${idx}
         RETURNING "storageBaseMb", "ext50mb", "ext100mb", "ext200mb",
                   ("storageBaseMb" + "ext50mb"*50 + "ext100mb"*100 + "ext200mb"*200) AS "totalQuotaMb"`,
        vals
    );
    if (!row) throw new AppError(404, 'Tổ chức không tồn tại');

    await query(
        `INSERT INTO storage_history (id, "organizationId", action, "performedById", "performedByName", detail, "createdAt")
         VALUES (gen_random_uuid()::text, $1, 'ADJUST_POOL', $2, $3, $4, NOW())`,
        [organizationId, performedById, performedByName, JSON.stringify({ ...data, note: data.note })]
    );

    logger.info('Storage pool adjusted', { organizationId, data });
    return row;
}

export async function listAllPurchaseRequests(status?: string): Promise<StoragePurchaseRequest[]> {
    const where = status ? `WHERE spr.status = $1` : '';
    const vals  = status ? [status] : [];
    return query<StoragePurchaseRequest>(
        `SELECT spr.id, spr."organizationId", o.name AS "orgName",
                spr."packageMb", spr.quantity, (spr."packageMb" * spr.quantity) AS "totalMb",
                spr.status, spr.note, spr."adminNote",
                spr."requestedById", spr."requestedByName",
                spr."resolvedById", spr."resolvedAt", spr."createdAt"
         FROM storage_purchase_requests spr
         JOIN organizations o ON o.id = spr."organizationId"
         ${where}
         ORDER BY spr."createdAt" DESC`,
        vals
    );
}

export async function approvePurchaseRequest(
    requestId: string,
    data: ResolveRequestBody,
    performedById: string,
    performedByName: string,
): Promise<StoragePurchaseRequest> {
    const req = await queryOne<{ organizationId: string; packageMb: number; quantity: number; status: string }>(
        `SELECT "organizationId", "packageMb", quantity, status FROM storage_purchase_requests WHERE id = $1`,
        [requestId]
    );
    if (!req) throw new AppError(404, 'Yêu cầu không tồn tại');
    if (req.status !== 'PENDING') throw new AppError(409, 'Yêu cầu đã được xử lý');

    const pkgCol: Record<number, string> = { 50: '"ext50mb"', 100: '"ext100mb"', 200: '"ext200mb"' };
    const col = pkgCol[req.packageMb];
    if (!col) throw new AppError(400, 'Gói không hợp lệ');

    await withTransaction(async (client) => {
        // Add storage to org pool
        await client.query(
            `UPDATE organizations SET ${col} = ${col} + $1, "updatedAt" = NOW() WHERE id = $2`,
            [req.quantity, req.organizationId]
        );
        // Mark request resolved
        await client.query(
            `UPDATE storage_purchase_requests
             SET status = 'APPROVED', "adminNote" = $1, "resolvedById" = $2, "resolvedAt" = NOW()
             WHERE id = $3`,
            [data.adminNote ?? null, performedById, requestId]
        );
        // Log history
        await client.query(
            `INSERT INTO storage_history (id, "organizationId", action, "performedById", "performedByName", detail, "createdAt")
             VALUES (gen_random_uuid()::text, $1, 'PURCHASE_APPROVED', $2, $3, $4, NOW())`,
            [req.organizationId, performedById, performedByName,
             JSON.stringify({ requestId, packageMb: req.packageMb, quantity: req.quantity })]
        );
    });

    logger.info('Storage purchase approved', { requestId, organizationId: req.organizationId });
    import('../../modules/notifications/notifications.service')
        .then(({ createNotification, NOTIF_TYPES }) =>
            createNotification(req.organizationId, NOTIF_TYPES.STORAGE_REQUEST_APPROVED,
                `Yêu cầu mua dung lượng đã được duyệt`,
                `+${req.packageMb * req.quantity} MB${data.adminNote ? ` — ${data.adminNote}` : ''}`,
                requestId, 'storage_request')
        ).catch(() => {});
    const updated = await queryOne<StoragePurchaseRequest>(
        `SELECT spr.*, o.name AS "orgName", (spr."packageMb" * spr.quantity) AS "totalMb"
         FROM storage_purchase_requests spr JOIN organizations o ON o.id = spr."organizationId"
         WHERE spr.id = $1`, [requestId]
    );
    return updated!;
}

export async function rejectPurchaseRequest(
    requestId: string,
    data: ResolveRequestBody,
    performedById: string,
    performedByName: string,
): Promise<StoragePurchaseRequest> {
    const req = await queryOne<{ organizationId: string; packageMb: number; quantity: number; status: string }>(
        `SELECT "organizationId", "packageMb", quantity, status FROM storage_purchase_requests WHERE id = $1`, [requestId]
    );
    if (!req) throw new AppError(404, 'Yêu cầu không tồn tại');
    if (req.status !== 'PENDING') throw new AppError(409, 'Yêu cầu đã được xử lý');

    await query(
        `UPDATE storage_purchase_requests
         SET status = 'REJECTED', "adminNote" = $1, "resolvedById" = $2, "resolvedAt" = NOW()
         WHERE id = $3`,
        [data.adminNote ?? null, performedById, requestId]
    );
    import('../../modules/notifications/notifications.service')
        .then(({ createNotification, NOTIF_TYPES }) =>
            createNotification(req.organizationId, NOTIF_TYPES.STORAGE_REQUEST_REJECTED,
                `Yêu cầu mua dung lượng bị từ chối`,
                `${req.packageMb * req.quantity} MB${data.adminNote ? ` — ${data.adminNote}` : ''}`,
                requestId, 'storage_request')
        ).catch(() => {});
    const updated = await queryOne<StoragePurchaseRequest>(
        `SELECT spr.*, o.name AS "orgName", (spr."packageMb" * spr.quantity) AS "totalMb"
         FROM storage_purchase_requests spr JOIN organizations o ON o.id = spr."organizationId"
         WHERE spr.id = $1`, [requestId]
    );
    return updated!;
}
