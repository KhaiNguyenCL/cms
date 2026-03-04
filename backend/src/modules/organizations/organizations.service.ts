import { query, queryOne } from '../../shared/database/db';
import { AppError } from '../../shared/middleware/error.middleware';
import logger from '../../shared/utils/logger';
import type { UpdateOrganizationBody, AddPointsBody } from './organizations.schema';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OrganizationRow {
    id: string;
    name: string;
    slug: string;
    settings: Record<string, unknown>;
    isActive: boolean;
    pointsTotal: number;
    pointsUsed: number;
    licenseStatus: string;
    suspendedAt: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface LicenseTransactionRow {
    id: string;
    organizationId: string;
    type: string;
    points: number;
    deviceCount: number | null;
    description: string | null;
    createdById: string | null;
    createdAt: string;
}

export interface LicenseInfo {
    pointsTotal: number;
    pointsUsed: number;
    pointsRemaining: number;
    licenseStatus: string;
    suspendedAt: string | null;
    licensedDevices: number;
    daysRemaining: number;
    recentTransactions: LicenseTransactionRow[];
}

export interface OrgStats {
    totalUsers: number;
    activeUsers: number;
    totalDevices: number;
    onlineDevices: number;
    totalMedia: number;
    totalMediaSizeBytes: number;
    totalPlaylists: number;
    totalSchedules: number;
}

// ─── Get organization ─────────────────────────────────────────────────────────

const ORG_FIELDS = `id, name, slug, settings, "isActive", "pointsTotal", "pointsUsed", "licenseStatus", "suspendedAt", "createdAt", "updatedAt"`;

export async function getMyOrganization(organizationId: string): Promise<OrganizationRow> {
    const org = await queryOne<OrganizationRow>(
        `SELECT ${ORG_FIELDS} FROM organizations WHERE id = $1`,
        [organizationId]
    );
    if (!org) throw new AppError(404, 'Organization không tồn tại');
    return org;
}

// ─── Update organization ──────────────────────────────────────────────────────

export async function updateMyOrganization(
    organizationId: string,
    data: UpdateOrganizationBody
): Promise<OrganizationRow> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (data.name !== undefined) {
        fields.push(`name = $${paramIndex++}`);
        values.push(data.name);
    }
    if (data.settings !== undefined) {
        fields.push(`settings = $${paramIndex++}`);
        values.push(JSON.stringify(data.settings));
    }

    if (fields.length === 0) throw new AppError(400, 'Không có dữ liệu để cập nhật');

    fields.push(`"updatedAt" = NOW()`);
    values.push(organizationId);

    const rows = await query<OrganizationRow>(
        `UPDATE organizations
         SET ${fields.join(', ')}
         WHERE id = $${paramIndex}
         RETURNING ${ORG_FIELDS}`,
        values
    );

    if (!rows[0]) throw new AppError(404, 'Organization không tồn tại');
    logger.info('Organization updated', { organizationId });
    return rows[0];
}

// ─── SUPER_ADMIN: list all organizations ──────────────────────────────────────

export interface OrgListRow extends OrganizationRow {
    totalUsers: number;
    activeUsers: number;
    totalDevices: number;
    onlineDevices: number;
    totalMedia: number;
    totalMediaSizeBytes: number;
    totalPlaylists: number;
    totalSchedules: number;
    licensedDevices: number;
    pointsRemaining: number;
    daysRemaining: number;
}

export async function listAllOrganizations(): Promise<OrgListRow[]> {
    const rows = await query<{
        id: string; name: string; slug: string;
        settings: Record<string, unknown>; isActive: boolean;
        pointsTotal: number; pointsUsed: number; licenseStatus: string; suspendedAt: string | null;
        createdAt: string; updatedAt: string;
        total_users: string; active_users: string;
        total_devices: string; online_devices: string;
        total_media: string; total_media_size: string;
        total_playlists: string; total_schedules: string;
        licensed_devices: string;
    }>(
        `SELECT
            o.id, o.name, o.slug, o.settings, o."isActive",
            o."pointsTotal", o."pointsUsed", o."licenseStatus", o."suspendedAt",
            o."createdAt", o."updatedAt",
            (SELECT COUNT(*) FROM users u WHERE u."organizationId" = o.id)                               AS total_users,
            (SELECT COUNT(*) FROM users u WHERE u."organizationId" = o.id AND u.status = 'ACTIVE')       AS active_users,
            (SELECT COUNT(*) FROM devices d WHERE d."organizationId" = o.id)                             AS total_devices,
            (SELECT COUNT(*) FROM devices d WHERE d."organizationId" = o.id AND d.status = 'ONLINE')     AS online_devices,
            (SELECT COUNT(*) FROM media m WHERE m."organizationId" = o.id)                               AS total_media,
            (SELECT COALESCE(SUM(m."fileSize"), 0) FROM media m WHERE m."organizationId" = o.id)         AS total_media_size,
            (SELECT COUNT(*) FROM playlists p WHERE p."organizationId" = o.id)                           AS total_playlists,
            (SELECT COUNT(*) FROM schedules s WHERE s."organizationId" = o.id)                           AS total_schedules,
            (SELECT COUNT(*) FROM devices d WHERE d."organizationId" = o.id AND d."isLicensed" = true)   AS licensed_devices
         FROM organizations o
         ORDER BY o."createdAt" DESC`,
        []
    );
    return rows.map(r => {
        const pointsTotal = r.pointsTotal;
        const pointsUsed = r.pointsUsed;
        const pointsRemaining = pointsTotal - pointsUsed;
        const licensedDevices = parseInt(r.licensed_devices);
        const daysRemaining = licensedDevices > 0 ? Math.floor(pointsRemaining / licensedDevices) : 0;
        return {
            id: r.id, name: r.name, slug: r.slug,
            settings: r.settings, isActive: r.isActive,
            pointsTotal, pointsUsed, licenseStatus: r.licenseStatus, suspendedAt: r.suspendedAt,
            createdAt: r.createdAt, updatedAt: r.updatedAt,
            totalUsers: parseInt(r.total_users),
            activeUsers: parseInt(r.active_users),
            totalDevices: parseInt(r.total_devices),
            onlineDevices: parseInt(r.online_devices),
            totalMedia: parseInt(r.total_media),
            totalMediaSizeBytes: parseInt(r.total_media_size),
            totalPlaylists: parseInt(r.total_playlists),
            totalSchedules: parseInt(r.total_schedules),
            licensedDevices,
            pointsRemaining,
            daysRemaining,
        };
    });
}

// ─── SUPER_ADMIN: toggle organization active status ───────────────────────────

export async function setOrganizationActive(orgId: string, isActive: boolean, requesterId: string): Promise<OrganizationRow> {
    // Block deactivating the requester's own organization
    const target = await queryOne<{ id: string; slug: string; organization_id: string }>(
        `SELECT o.id, o.slug, u."organizationId" as organization_id
         FROM organizations o
         LEFT JOIN users u ON u.id = $2
         WHERE o.id = $1`,
        [orgId, requesterId]
    );
    if (!target) throw new AppError(404, 'Organization không tồn tại');

    if (!isActive && target.organization_id === orgId) {
        throw new AppError(400, 'Không thể tắt tổ chức của chính mình');
    }

    const rows = await query<OrganizationRow>(
        `UPDATE organizations
         SET "isActive" = $1, "updatedAt" = NOW()
         WHERE id = $2
         RETURNING ${ORG_FIELDS}`,
        [isActive, orgId]
    );
    if (!rows[0]) throw new AppError(404, 'Organization không tồn tại');
    logger.info('Organization status changed', { orgId, isActive });
    return rows[0];
}

// ─── License info ─────────────────────────────────────────────────────────────

export async function getLicenseInfo(organizationId: string): Promise<LicenseInfo> {
    const org = await queryOne<{
        pointsTotal: number; pointsUsed: number;
        licenseStatus: string; suspendedAt: string | null;
    }>(
        `SELECT "pointsTotal", "pointsUsed", "licenseStatus", "suspendedAt"
         FROM organizations WHERE id = $1`,
        [organizationId]
    );
    if (!org) throw new AppError(404, 'Organization không tồn tại');

    const licensedRes = await queryOne<{ count: string }>(
        `SELECT COUNT(*) AS count FROM devices WHERE "organizationId" = $1 AND "isLicensed" = true`,
        [organizationId]
    );
    const licensedDevices = parseInt(licensedRes?.count ?? '0');
    const pointsRemaining = org.pointsTotal - org.pointsUsed;
    const daysRemaining = licensedDevices > 0 ? Math.floor(pointsRemaining / licensedDevices) : 0;

    const recentTransactions = await query<LicenseTransactionRow>(
        `SELECT id, "organizationId", type, points, "deviceCount", description, "createdById", "createdAt"
         FROM license_transactions
         WHERE "organizationId" = $1
         ORDER BY "createdAt" DESC
         LIMIT 30`,
        [organizationId]
    );

    return {
        pointsTotal: org.pointsTotal,
        pointsUsed: org.pointsUsed,
        pointsRemaining,
        licenseStatus: org.licenseStatus,
        suspendedAt: org.suspendedAt,
        licensedDevices,
        daysRemaining,
        recentTransactions,
    };
}

// ─── Add points (SUPER_ADMIN) ─────────────────────────────────────────────────

export async function addPoints(
    orgId: string,
    data: AddPointsBody,
    createdById: string
): Promise<LicenseInfo> {
    const org = await queryOne<{
        pointsTotal: number; pointsUsed: number;
        licenseStatus: string; suspendedAt: string | null;
    }>(
        `SELECT "pointsTotal", "pointsUsed", "licenseStatus", "suspendedAt"
         FROM organizations WHERE id = $1`,
        [orgId]
    );
    if (!org) throw new AppError(404, 'Organization không tồn tại');

    const newPointsTotal = org.pointsTotal + data.points;
    const pointsRemaining = newPointsTotal - org.pointsUsed;

    // Recalculate licenseStatus if org was SUSPENDED/EXPIRED
    let newStatus = org.licenseStatus;
    let newSuspendedAt: string | null = org.suspendedAt;

    if (pointsRemaining > 0 && (org.licenseStatus === 'SUSPENDED' || org.licenseStatus === 'EXPIRED')) {
        const licensedRes = await queryOne<{ count: string }>(
            `SELECT COUNT(*) AS count FROM devices WHERE "organizationId" = $1 AND "isLicensed" = true`,
            [orgId]
        );
        const n = parseInt(licensedRes?.count ?? '0');
        const daysLeft = n > 0 ? pointsRemaining / n : 999;
        newStatus = daysLeft > 7 ? 'ACTIVE' : 'WARNING';
        newSuspendedAt = null;
    }

    await query(
        `UPDATE organizations
         SET "pointsTotal" = $1, "licenseStatus" = $2, "suspendedAt" = $3, "updatedAt" = NOW()
         WHERE id = $4`,
        [newPointsTotal, newStatus, newSuspendedAt, orgId]
    );

    await query(
        `INSERT INTO license_transactions (id, "organizationId", type, points, description, "createdById", "createdAt")
         VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, NOW())`,
        [orgId, data.type ?? 'PURCHASE', data.points, data.description, createdById]
    );

    logger.info('Points added to org', { orgId, points: data.points, by: createdById });
    return getLicenseInfo(orgId);
}

// ─── Update device admin PIN ──────────────────────────────────────────────────

export async function updateDevicePin(organizationId: string, pin: string): Promise<void> {
    await query(
        `UPDATE organizations SET "deviceAdminPin" = $1, "updatedAt" = NOW() WHERE id = $2`,
        [pin, organizationId]
    );
    logger.info('Device admin PIN updated', { organizationId });
}

// ─── Stats ────────────────────────────────────────────────────────────────────

export async function getOrganizationStats(organizationId: string): Promise<OrgStats> {
    const [usersResult, devicesResult, mediaResult, playlistsResult, schedulesResult] =
        await Promise.all([
            queryOne<{ total: string; active: string }>(
                `SELECT COUNT(*) as total,
                        COUNT(*) FILTER (WHERE status = 'ACTIVE') as active
                 FROM users WHERE "organizationId" = $1`,
                [organizationId]
            ),
            queryOne<{ total: string; online: string }>(
                `SELECT COUNT(*) as total,
                        COUNT(*) FILTER (WHERE status = 'ONLINE') as online
                 FROM devices WHERE "organizationId" = $1`,
                [organizationId]
            ),
            queryOne<{ total: string; total_size: string }>(
                `SELECT COUNT(*) as total,
                        COALESCE(SUM("fileSize"), 0) as total_size
                 FROM media WHERE "organizationId" = $1`,
                [organizationId]
            ),
            queryOne<{ total: string }>(
                `SELECT COUNT(*) as total FROM playlists WHERE "organizationId" = $1`,
                [organizationId]
            ),
            queryOne<{ total: string }>(
                `SELECT COUNT(*) as total FROM schedules WHERE "organizationId" = $1`,
                [organizationId]
            ),
        ]);

    return {
        totalUsers: parseInt(usersResult?.total ?? '0'),
        activeUsers: parseInt(usersResult?.active ?? '0'),
        totalDevices: parseInt(devicesResult?.total ?? '0'),
        onlineDevices: parseInt(devicesResult?.online ?? '0'),
        totalMedia: parseInt(mediaResult?.total ?? '0'),
        totalMediaSizeBytes: parseInt(mediaResult?.total_size ?? '0'),
        totalPlaylists: parseInt(playlistsResult?.total ?? '0'),
        totalSchedules: parseInt(schedulesResult?.total ?? '0'),
    };
}
