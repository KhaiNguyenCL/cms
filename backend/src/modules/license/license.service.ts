import { query, queryOne, withTransaction } from '../../shared/database/db';
import type { PoolClient } from 'pg';
import { AppError } from '../../shared/middleware/error.middleware';
import logger from '../../shared/utils/logger';
import redis, { RedisKeys } from '../../shared/cache/redis';

// ─── Constants ────────────────────────────────────────────────────────────────

export type PackageType    = '12M' | '24M' | '36M';
export type LicenseAction  = 'ASSIGN' | 'TRANSFER' | 'ADJUST_EXPIRY' | 'REVOKE' | 'EDIT_POOL';
export type RequestStatus  = 'PENDING' | 'APPROVED' | 'REJECTED';

export const PKG_MONTHS: Record<PackageType, number> = { '12M': 12, '24M': 24, '36M': 36 };
export const PKG_LABELS: Record<PackageType, string>  = {
    '12M': '12 tháng', '24M': '24 tháng', '36M': '36 tháng',
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OrgPool {
    pkg12m: number;
    pkg24m: number;
    pkg36m: number;
}

export interface DeviceLicenseRow {
    deviceId: string;
    deviceName: string;
    deviceStatus: string;
    isLicensed: boolean;
    packageType: string | null;
    activatedAt: string | null;
    expiresAt: string | null;
    activatedByName: string | null;
    transferredFromDeviceName: string | null;
    daysRemaining: number | null;
}

export interface LicenseHistoryRow {
    id: string;
    deviceId: string | null;
    deviceName: string | null;
    organizationId: string;
    action: LicenseAction;
    detail: Record<string, unknown> | null;
    performedByName: string | null;
    createdAt: string;
}

export interface PurchaseRequestRow {
    id: string;
    organizationId: string;
    orgName: string | null;
    requestedByName: string | null;
    packageType: string;
    quantity: number;
    status: RequestStatus;
    note: string | null;
    adminNote: string | null;
    resolvedAt: string | null;
    createdAt: string;
}

export interface LicenseStats {
    pool: OrgPool;
    totalDevices: number;
    activeDevices: number;
    expiredDevices: number;
    unlicensedDevices: number;
    expiringIn7: number;
    expiringIn30: number;
}

// ─── DB helpers ───────────────────────────────────────────────────────────────

type Row = Record<string, unknown>;
async function cq<T = Row>(client: PoolClient, sql: string, p?: unknown[]): Promise<T[]> {
    return client.query(sql, p).then(r => r.rows as T[]);
}
async function cqOne<T = Row>(client: PoolClient, sql: string, p?: unknown[]): Promise<T | null> {
    return client.query(sql, p).then(r => r.rows[0] as T ?? null);
}

async function logHistory(
    client: PoolClient,
    orgId: string,
    action: LicenseAction,
    opts: {
        deviceId?: string | null;
        deviceName?: string | null;
        performedById?: string | null;
        performedByName?: string | null;
        detail?: Record<string, unknown>;
    },
) {
    await cq(client,
        `INSERT INTO license_history
           (id, "organizationId", "deviceId", "deviceName", action, detail,
            "performedById", "performedByName", "createdAt")
         VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7, NOW())`,
        [orgId, opts.deviceId ?? null, opts.deviceName ?? null, action,
         opts.detail ? JSON.stringify(opts.detail) : null,
         opts.performedById ?? null, opts.performedByName ?? null],
    );
}

// ─── Pool ─────────────────────────────────────────────────────────────────────

export async function getPool(organizationId: string): Promise<OrgPool> {
    const row = await queryOne<OrgPool>(
        `SELECT "pkg12m", "pkg24m", "pkg36m" FROM organizations WHERE id = $1`,
        [organizationId],
    );
    if (!row) throw new AppError(404, 'Tổ chức không tồn tại');
    return row;
}

/** SUPER_ADMIN: detail for one org — device licenses + pool batches + license history + current pool */
export async function getOrgDetail(organizationId: string): Promise<{
    devices: DeviceLicenseRow[];
    poolBatches: Array<{
        id: string;
        createdAt: string;
        performedByName: string | null;
        delta: { pkg12m?: number; pkg24m?: number; pkg36m?: number };
        source: string | null;
    }>;
    licenseHistory: LicenseHistoryRow[];
    pool: OrgPool;
}> {
    const [devices, poolHistRows, licHistRows, pool] = await Promise.all([
        getDeviceLicenses(organizationId),
        query<LicenseHistoryRow>(
            `SELECT id, detail, "performedByName", "createdAt"
             FROM license_history
             WHERE "organizationId" = $1 AND action = 'EDIT_POOL'
             ORDER BY "createdAt" DESC LIMIT 200`,
            [organizationId],
        ),
        query<LicenseHistoryRow>(
            `SELECT id, "deviceId", "deviceName", "organizationId", action,
                    detail, "performedByName", "createdAt"
             FROM license_history
             WHERE "organizationId" = $1 AND action <> 'EDIT_POOL'
             ORDER BY "createdAt" DESC LIMIT 300`,
            [organizationId],
        ),
        getPool(organizationId),
    ]);

    const poolBatches = poolHistRows.map(h => {
        const d = (h.detail ?? {}) as Record<string, unknown>;
        const delta = (d.delta as { pkg12m?: number; pkg24m?: number; pkg36m?: number }) ?? {};
        return {
            id: h.id,
            createdAt: h.createdAt,
            performedByName: h.performedByName,
            delta,
            source: typeof d.source === 'string' ? d.source : null,
        };
    });

    return { devices, poolBatches, licenseHistory: licHistRows, pool };
}

/** SUPER_ADMIN: get pool + device counts for all orgs */
export async function getAllOrgPools(): Promise<(OrgPool & {
    id: string; name: string; slug: string;
    totalDevices: number; licensedDevices: number; expiringIn7: number;
})[]> {
    return query(
        `SELECT o.id, o.name, o.slug,
                o."pkg12m", o."pkg24m", o."pkg36m",
                COUNT(d.id)::int                                                          AS "totalDevices",
                COUNT(d.id) FILTER (WHERE d."isLicensed" = true)::int                    AS "licensedDevices",
                COUNT(dl.id) FILTER (
                    WHERE dl."expiresAt" > NOW()
                      AND dl."expiresAt" <= NOW() + INTERVAL '7 days'
                )::int                                                                    AS "expiringIn7"
         FROM organizations o
         LEFT JOIN devices d  ON d."organizationId" = o.id
         LEFT JOIN device_licenses dl ON dl."deviceId" = d.id
         GROUP BY o.id
         ORDER BY o.name`,
    );
}

export async function updatePool(
    organizationId: string,
    delta: { pkg12m?: number; pkg24m?: number; pkg36m?: number },
    performedById: string,
    performedByName: string,
): Promise<OrgPool> {
    const fields: string[] = [];
    const vals: unknown[]  = [];
    let idx = 1;
    if (delta.pkg12m !== undefined) { fields.push(`"pkg12m" = GREATEST(0, "pkg12m" + $${idx++})`); vals.push(delta.pkg12m); }
    if (delta.pkg24m !== undefined) { fields.push(`"pkg24m" = GREATEST(0, "pkg24m" + $${idx++})`); vals.push(delta.pkg24m); }
    if (delta.pkg36m !== undefined) { fields.push(`"pkg36m" = GREATEST(0, "pkg36m" + $${idx++})`); vals.push(delta.pkg36m); }
    if (fields.length === 0) throw new AppError(400, 'Không có thay đổi');

    vals.push(organizationId);
    const row = await queryOne<OrgPool>(
        `UPDATE organizations SET ${fields.join(', ')}, "updatedAt" = NOW()
         WHERE id = $${idx}
         RETURNING "pkg12m", "pkg24m", "pkg36m"`,
        vals,
    );
    if (!row) throw new AppError(404, 'Tổ chức không tồn tại');

    await withTransaction(async (client) => {
        await logHistory(client, organizationId, 'EDIT_POOL', {
            performedById,
            performedByName,
            detail: { delta },
        });
    });

    logger.info('License pool updated', { organizationId, delta });
    return row;
}

// ─── Device licenses ──────────────────────────────────────────────────────────

export async function getDeviceLicenses(organizationId: string): Promise<DeviceLicenseRow[]> {
    return query<DeviceLicenseRow>(
        `SELECT
            d.id             AS "deviceId",
            d.name           AS "deviceName",
            d.status         AS "deviceStatus",
            d."isLicensed",
            dl."packageType",
            dl."activatedAt",
            dl."expiresAt",
            dl."activatedByName",
            d2.name          AS "transferredFromDeviceName",
            CASE
                WHEN dl."expiresAt" IS NOT NULL AND dl."expiresAt" > NOW()
                THEN GREATEST(0, EXTRACT(DAY FROM dl."expiresAt" - NOW())::int)
                ELSE NULL
            END              AS "daysRemaining"
         FROM devices d
         LEFT JOIN device_licenses dl ON dl."deviceId" = d.id
         LEFT JOIN devices d2 ON d2.id = dl."transferredFromDeviceId"
         WHERE d."organizationId" = $1
         ORDER BY d.name`,
        [organizationId],
    );
}

// ─── Assign ───────────────────────────────────────────────────────────────────

export async function assignLicense(
    organizationId: string,
    deviceId: string,
    packageType: PackageType,
    performedById: string,
    performedByName: string,
): Promise<void> {
    await withTransaction(async (client) => {
        // Lock org row to prevent concurrent pool deductions
        const org = await cqOne<{ pkg12m: number; pkg24m: number; pkg36m: number }>(client,
            `SELECT "pkg12m", "pkg24m", "pkg36m"
             FROM organizations WHERE id = $1 FOR UPDATE`,
            [organizationId],
        );
        if (!org) throw new AppError(404, 'Tổ chức không tồn tại');

        const colMap: Record<PackageType, keyof typeof org> = {
            '12M': 'pkg12m', '24M': 'pkg24m', '36M': 'pkg36m',
        };
        const col = colMap[packageType];
        if ((org[col] as number) <= 0) {
            throw new AppError(409, `Không còn gói ${PKG_LABELS[packageType]} trong kho`);
        }

        const device = await cqOne<{ id: string; name: string }>(client,
            `SELECT id, name FROM devices WHERE id = $1 AND "organizationId" = $2`,
            [deviceId, organizationId],
        );
        if (!device) throw new AppError(404, 'Thiết bị không tồn tại');

        // Check no active license already
        const existing = await cqOne<{ expiresAt: string }>(client,
            `SELECT "expiresAt" FROM device_licenses WHERE "deviceId" = $1`,
            [deviceId],
        );
        if (existing && new Date(existing.expiresAt) > new Date()) {
            throw new AppError(409, 'Thiết bị đã có license còn hiệu lực. Thu hồi trước khi gán mới.');
        }

        const months    = PKG_MONTHS[packageType];
        const activatedAt = new Date();
        const expiresAt   = new Date(activatedAt);
        expiresAt.setMonth(expiresAt.getMonth() + months);

        // Deduct from pool
        await cq(client,
            `UPDATE organizations SET "${col}" = "${col}" - 1, "updatedAt" = NOW() WHERE id = $1`,
            [organizationId],
        );

        // Upsert device_license
        await cq(client,
            `INSERT INTO device_licenses
               (id, "deviceId", "organizationId", "packageType",
                "activatedAt", "expiresAt", "activatedById", "activatedByName")
             VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT ("deviceId") DO UPDATE SET
               "packageType" = $3, "activatedAt" = $4, "expiresAt" = $5,
               "activatedById" = $6, "activatedByName" = $7,
               "transferredFromDeviceId" = NULL`,
            [deviceId, organizationId, packageType,
             activatedAt.toISOString(), expiresAt.toISOString(),
             performedById, performedByName],
        );

        // Update device — sync license dates (use YYYY-MM-DD for DATE columns to avoid type conflict)
        await cq(client,
            `UPDATE devices
             SET "isLicensed" = true, "licenseExpiresAt" = $1,
                 "licenseStartDate" = $2, "licenseEndDate" = $3, "updatedAt" = NOW()
             WHERE id = $4`,
            [expiresAt.toISOString(),
             activatedAt.toISOString().slice(0, 10),
             expiresAt.toISOString().slice(0, 10),
             deviceId],
        );

        await logHistory(client, organizationId, 'ASSIGN', {
            deviceId, deviceName: device.name,
            performedById, performedByName,
            detail: { packageType, expiresAt: expiresAt.toISOString() },
        });
    });
    await redis.del(RedisKeys.deviceLicenseCache(deviceId));
    logger.info('License assigned', { organizationId, deviceId, packageType });
}

// ─── Transfer ─────────────────────────────────────────────────────────────────

export async function transferLicense(
    organizationId: string,
    fromDeviceId: string,
    toDeviceId: string,
    performedById: string,
    performedByName: string,
): Promise<void> {
    if (fromDeviceId === toDeviceId) throw new AppError(400, 'Không thể chuyển sang cùng thiết bị');

    await withTransaction(async (client) => {
        const lic = await cqOne<{ expiresAt: string; packageType: string }>(client,
            `SELECT "expiresAt", "packageType"
             FROM device_licenses WHERE "deviceId" = $1 AND "organizationId" = $2
             FOR UPDATE`,
            [fromDeviceId, organizationId],
        );
        if (!lic) throw new AppError(404, 'Thiết bị nguồn chưa có license');
        if (new Date(lic.expiresAt) <= new Date()) {
            throw new AppError(409, 'License nguồn đã hết hạn, không thể chuyển');
        }

        const [fromDev, toDev] = await Promise.all([
            cqOne<{ id: string; name: string }>(client,
                `SELECT id, name FROM devices WHERE id = $1 AND "organizationId" = $2`,
                [fromDeviceId, organizationId],
            ),
            cqOne<{ id: string; name: string }>(client,
                `SELECT id, name FROM devices WHERE id = $1 AND "organizationId" = $2`,
                [toDeviceId, organizationId],
            ),
        ]);
        if (!fromDev) throw new AppError(404, 'Thiết bị nguồn không tồn tại');
        if (!toDev)   throw new AppError(404, 'Thiết bị đích không tồn tại');

        // Check target has no active license
        const targetLic = await cqOne<{ expiresAt: string }>(client,
            `SELECT "expiresAt" FROM device_licenses WHERE "deviceId" = $1`,
            [toDeviceId],
        );
        if (targetLic && new Date(targetLic.expiresAt) > new Date()) {
            throw new AppError(409, 'Thiết bị đích đã có license còn hiệu lực. Thu hồi trước.');
        }

        // Move license: delete from source, upsert on target
        await cq(client, `DELETE FROM device_licenses WHERE "deviceId" = $1`, [fromDeviceId]);
        await cq(client,
            `INSERT INTO device_licenses
               (id, "deviceId", "organizationId", "packageType",
                "activatedAt", "expiresAt", "activatedById", "activatedByName", "transferredFromDeviceId")
             VALUES (gen_random_uuid()::text, $1, $2, $3, NOW(), $4, $5, $6, $7)
             ON CONFLICT ("deviceId") DO UPDATE SET
               "packageType" = $3, "expiresAt" = $4,
               "activatedById" = $5, "activatedByName" = $6, "transferredFromDeviceId" = $7`,
            [toDeviceId, organizationId, lic.packageType,
             lic.expiresAt, performedById, performedByName, fromDeviceId],
        );

        // Update device flags — sync license dates
        await cq(client,
            `UPDATE devices SET "isLicensed" = false, "licenseExpiresAt" = NULL,
                 "licenseStartDate" = NULL, "licenseEndDate" = NULL, "updatedAt" = NOW()
             WHERE id = $1`,
            [fromDeviceId],
        );
        await cq(client,
            `UPDATE devices SET "isLicensed" = true, "licenseExpiresAt" = $1,
                 "licenseStartDate" = $2, "licenseEndDate" = $3, "updatedAt" = NOW()
             WHERE id = $4`,
            [lic.expiresAt,
             new Date().toISOString().slice(0, 10),
             new Date(lic.expiresAt).toISOString().slice(0, 10),
             toDeviceId],
        );

        await logHistory(client, organizationId, 'TRANSFER', {
            deviceId: toDeviceId, deviceName: toDev.name,
            performedById, performedByName,
            detail: {
                fromDeviceId, fromDeviceName: fromDev.name,
                toDeviceId, toDeviceName: toDev.name,
                packageType: lic.packageType, expiresAt: lic.expiresAt,
            },
        });
    });
    await Promise.all([
        redis.del(RedisKeys.deviceLicenseCache(fromDeviceId)),
        redis.del(RedisKeys.deviceLicenseCache(toDeviceId)),
    ]);
    logger.info('License transferred', { organizationId, fromDeviceId, toDeviceId });
}

// ─── Adjust expiry ────────────────────────────────────────────────────────────

export async function adjustExpiry(
    organizationId: string,
    deviceId: string,
    newExpiresAt: string,
    performedById: string,
    performedByName: string,
): Promise<void> {
    const d = new Date(newExpiresAt);
    if (isNaN(d.getTime()) || d <= new Date()) {
        throw new AppError(400, 'Ngày hết hạn phải ở tương lai');
    }

    await withTransaction(async (client) => {
        const lic = await cqOne<{ expiresAt: string; packageType: string }>(client,
            `SELECT dl."expiresAt", dl."packageType", d.name AS "deviceName"
             FROM device_licenses dl
             JOIN devices d ON d.id = dl."deviceId"
             WHERE dl."deviceId" = $1 AND dl."organizationId" = $2
             FOR UPDATE`,
            [deviceId, organizationId],
        ) as ({ expiresAt: string; packageType: string; deviceName: string } | null);
        if (!lic) throw new AppError(404, 'Thiết bị chưa có license');

        await cq(client,
            `UPDATE device_licenses SET "expiresAt" = $1 WHERE "deviceId" = $2`,
            [d.toISOString(), deviceId],
        );
        await cq(client,
            `UPDATE devices SET "isLicensed" = true, "licenseExpiresAt" = $1,
                 "licenseEndDate" = $2, "updatedAt" = NOW()
             WHERE id = $3`,
            [d.toISOString(), d.toISOString().slice(0, 10), deviceId],
        );

        await logHistory(client, organizationId, 'ADJUST_EXPIRY', {
            deviceId,
            deviceName: (lic as unknown as { deviceName: string }).deviceName,
            performedById, performedByName,
            detail: { oldExpiresAt: lic.expiresAt, newExpiresAt: d.toISOString() },
        });
    });
    logger.info('License expiry adjusted', { organizationId, deviceId, newExpiresAt });
}

// ─── Revoke ───────────────────────────────────────────────────────────────────

export async function revokeLicense(
    organizationId: string,
    deviceId: string,
    performedById: string,
    performedByName: string,
): Promise<void> {
    await withTransaction(async (client) => {
        const lic = await cqOne<{
            packageType: string; expiresAt: string;
        }>(client,
            `SELECT dl."packageType", dl."expiresAt", d.name AS "deviceName"
             FROM device_licenses dl
             JOIN devices d ON d.id = dl."deviceId"
             WHERE dl."deviceId" = $1 AND dl."organizationId" = $2
             FOR UPDATE`,
            [deviceId, organizationId],
        ) as ({ packageType: string; expiresAt: string; deviceName: string } | null);
        if (!lic) throw new AppError(404, 'Thiết bị chưa có license');

        const colMap: Record<string, string> = {
            '12M': 'pkg12m', '24M': 'pkg24m', '36M': 'pkg36m',
        };
        const col = colMap[lic.packageType];

        // Delete license
        await cq(client,
            `DELETE FROM device_licenses WHERE "deviceId" = $1`, [deviceId],
        );

        // Return to pool if license not yet expired
        if (col && new Date(lic.expiresAt) > new Date()) {
            await cq(client,
                `UPDATE organizations SET "${col}" = "${col}" + 1, "updatedAt" = NOW()
                 WHERE id = $1`,
                [organizationId],
            );
        }

        await cq(client,
            `UPDATE devices SET "isLicensed" = false, "licenseExpiresAt" = NULL,
                 "licenseStartDate" = NULL, "licenseEndDate" = NULL, "updatedAt" = NOW()
             WHERE id = $1`,
            [deviceId],
        );

        await logHistory(client, organizationId, 'REVOKE', {
            deviceId,
            deviceName: (lic as unknown as { deviceName: string }).deviceName,
            performedById, performedByName,
            detail: { packageType: lic.packageType, expiresAt: lic.expiresAt },
        });
    });
    await redis.del(RedisKeys.deviceLicenseCache(deviceId));
    logger.info('License revoked', { organizationId, deviceId });
}

// ─── Stats ────────────────────────────────────────────────────────────────────

export async function getStats(organizationId: string): Promise<LicenseStats> {
    const [pool, devRow, expRow] = await Promise.all([
        getPool(organizationId),
        queryOne<{ total: string; active: string; expired: string; unlicensed: string }>(
            `SELECT
                COUNT(*)                                                         AS total,
                COUNT(*) FILTER (WHERE d."isLicensed" = true)                   AS active,
                COUNT(*) FILTER (WHERE d."isLicensed" = false
                                   AND dl."deviceId" IS NOT NULL)                AS expired,
                COUNT(*) FILTER (WHERE dl."deviceId" IS NULL)                   AS unlicensed
             FROM devices d
             LEFT JOIN device_licenses dl ON dl."deviceId" = d.id
             WHERE d."organizationId" = $1`,
            [organizationId],
        ),
        queryOne<{ exp7: string; exp30: string }>(
            `SELECT
                COUNT(*) FILTER (WHERE dl."expiresAt" > NOW()
                  AND dl."expiresAt" <= NOW() + INTERVAL '7 days')  AS exp7,
                COUNT(*) FILTER (WHERE dl."expiresAt" > NOW()
                  AND dl."expiresAt" <= NOW() + INTERVAL '30 days') AS exp30
             FROM device_licenses dl
             JOIN devices d ON d.id = dl."deviceId"
             WHERE d."organizationId" = $1`,
            [organizationId],
        ),
    ]);
    return {
        pool,
        totalDevices:     parseInt(devRow?.total     ?? '0'),
        activeDevices:    parseInt(devRow?.active    ?? '0'),
        expiredDevices:   parseInt(devRow?.expired   ?? '0'),
        unlicensedDevices:parseInt(devRow?.unlicensed?? '0'),
        expiringIn7:      parseInt(expRow?.exp7      ?? '0'),
        expiringIn30:     parseInt(expRow?.exp30     ?? '0'),
    };
}

// ─── History ──────────────────────────────────────────────────────────────────

export async function getHistory(
    organizationId: string,
    limit = 100,
    deviceId?: string,
): Promise<LicenseHistoryRow[]> {
    const params: unknown[] = [organizationId];
    let where = `"organizationId" = $1`;
    if (deviceId) {
        params.push(deviceId);
        where += ` AND "deviceId" = $2`;
    }
    params.push(limit);
    return query<LicenseHistoryRow>(
        `SELECT id, "deviceId", "deviceName", "organizationId", action,
                detail, "performedByName", "createdAt"
         FROM license_history
         WHERE ${where}
         ORDER BY "createdAt" DESC
         LIMIT $${params.length}`,
        params,
    );
}

// ─── Purchase Requests ────────────────────────────────────────────────────────

export async function getPurchaseRequests(
    organizationId: string,
    isSuperAdmin: boolean,
): Promise<PurchaseRequestRow[]> {
    if (isSuperAdmin) {
        return query<PurchaseRequestRow>(
            `SELECT pr.id, pr."organizationId", o.name AS "orgName",
                    pr."requestedByName", pr."packageType", pr.quantity,
                    pr.status, pr.note, pr."adminNote", pr."resolvedAt", pr."createdAt"
             FROM purchase_requests pr
             JOIN organizations o ON o.id = pr."organizationId"
             ORDER BY pr."createdAt" DESC
             LIMIT 200`,
        );
    }
    return query<PurchaseRequestRow>(
        `SELECT id, "organizationId", NULL AS "orgName",
                "requestedByName", "packageType", quantity,
                status, note, "adminNote", "resolvedAt", "createdAt"
         FROM purchase_requests
         WHERE "organizationId" = $1
         ORDER BY "createdAt" DESC
         LIMIT 100`,
        [organizationId],
    );
}

export async function createPurchaseRequest(
    organizationId: string,
    requestedById: string,
    requestedByName: string,
    packageType: PackageType,
    quantity: number,
    note?: string,
): Promise<PurchaseRequestRow> {
    if (quantity < 1 || quantity > 100) throw new AppError(400, 'Số lượng phải từ 1–100');
    if (!PKG_MONTHS[packageType]) throw new AppError(400, 'Loại gói không hợp lệ');

    const row = await queryOne<PurchaseRequestRow>(
        `INSERT INTO purchase_requests
           (id, "organizationId", "requestedById", "requestedByName",
            "packageType", quantity, status, note, "createdAt")
         VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, 'PENDING', $6, NOW())
         RETURNING id, "organizationId", NULL AS "orgName",
                   "requestedByName", "packageType", quantity,
                   status, note, "adminNote", "resolvedAt", "createdAt"`,
        [organizationId, requestedById, requestedByName, packageType, quantity, note ?? null],
    );
    return row!;
}

export async function approvePurchaseRequest(
    requestId: string,
    adminId: string,
    adminName: string,
    adminNote?: string,
): Promise<void> {
    await withTransaction(async (client) => {
        // Lock row first to prevent concurrent approvals
        const req = await cqOne<{
            id: string; organizationId: string;
            packageType: PackageType; quantity: number; status: string;
        }>(client,
            `SELECT id, "organizationId", "packageType", quantity, status
             FROM purchase_requests WHERE id = $1 FOR UPDATE`,
            [requestId],
        );
        if (!req) throw new AppError(404, 'Yêu cầu không tồn tại');
        if (req.status !== 'PENDING') throw new AppError(409, 'Yêu cầu đã được xử lý');

        const colMap: Record<PackageType, string> = {
            '12M': 'pkg12m', '24M': 'pkg24m', '36M': 'pkg36m',
        };
        const col = colMap[req.packageType];

        await cq(client,
            `UPDATE purchase_requests
             SET status = 'APPROVED', "adminNote" = $1, "resolvedById" = $2, "resolvedAt" = NOW()
             WHERE id = $3`,
            [adminNote ?? null, adminId, requestId],
        );
        await cq(client,
            `UPDATE organizations SET "${col}" = "${col}" + $1, "updatedAt" = NOW()
             WHERE id = $2`,
            [req.quantity, req.organizationId],
        );
        await logHistory(client, req.organizationId, 'EDIT_POOL', {
            performedById: adminId,
            performedByName: adminName,
            detail: {
                source: 'PURCHASE_REQUEST',
                requestId,
                packageType: req.packageType,
                quantity: req.quantity,
            },
        });
    });
    logger.info('Purchase request approved', { requestId, adminId });
}

export async function rejectPurchaseRequest(
    requestId: string,
    adminId: string,
    adminNote?: string,
): Promise<void> {
    const req = await queryOne<{ status: string }>(
        `SELECT status FROM purchase_requests WHERE id = $1`, [requestId],
    );
    if (!req) throw new AppError(404, 'Yêu cầu không tồn tại');
    if (req.status !== 'PENDING') throw new AppError(409, 'Yêu cầu đã được xử lý');

    await query(
        `UPDATE purchase_requests
         SET status = 'REJECTED', "adminNote" = $1, "resolvedById" = $2, "resolvedAt" = NOW()
         WHERE id = $3`,
        [adminNote ?? null, adminId, requestId],
    );
}

// ─── Daily expiry check (BullMQ worker) ──────────────────────────────────────

export async function runExpiryCheck(): Promise<{ expired: number }> {
    // Atomically mark expired devices + write audit history in one CTE
    const result = await query<{ id: string }>(
        `WITH expired AS (
             UPDATE devices SET "isLicensed" = false, "updatedAt" = NOW()
             WHERE "licenseExpiresAt" IS NOT NULL
               AND "licenseExpiresAt" < NOW()
               AND "isLicensed" = true
             RETURNING id, "organizationId", name
         )
         INSERT INTO license_history
           (id, "organizationId", "deviceId", "deviceName", action, detail, "createdAt")
         SELECT gen_random_uuid()::text, "organizationId", id, name,
                'REVOKE', '{"reason":"AUTO_EXPIRED","auto":true}'::jsonb, NOW()
         FROM expired
         RETURNING id`,
    );
    if (result.length > 0) {
        logger.info('License expiry check: expired devices', { count: result.length });
    }
    return { expired: result.length };
}
