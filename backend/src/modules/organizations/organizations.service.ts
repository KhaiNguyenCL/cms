import { query, queryOne } from '../../shared/database/db';
import { AppError } from '../../shared/middleware/error.middleware';
import logger from '../../shared/utils/logger';
import type { UpdateOrganizationBody } from './organizations.schema';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OrganizationRow {
    id: string;
    name: string;
    slug: string;
    settings: Record<string, unknown>;
    isActive: boolean;
    pkg12m: number;
    pkg24m: number;
    pkg36m: number;
    createdAt: string;
    updatedAt: string;
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

const ORG_FIELDS = `id, name, slug, settings, "isActive", "pkg12m", "pkg24m", "pkg36m", "createdAt", "updatedAt"`;

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
}

export async function listAllOrganizations(): Promise<OrgListRow[]> {
    const rows = await query<{
        id: string; name: string; slug: string;
        settings: Record<string, unknown>; isActive: boolean;
        pkg12m: number; pkg24m: number; pkg36m: number;
        createdAt: string; updatedAt: string;
        total_users: string; active_users: string;
        total_devices: string; online_devices: string;
        total_media: string; total_media_size: string;
        total_playlists: string; total_schedules: string;
        licensed_devices: string;
    }>(
        `SELECT
            o.id, o.name, o.slug, o.settings, o."isActive",
            o."pkg12m", o."pkg24m", o."pkg36m",
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
    return rows.map(r => ({
        id: r.id, name: r.name, slug: r.slug,
        settings: r.settings, isActive: r.isActive,
        pkg12m: r.pkg12m, pkg24m: r.pkg24m, pkg36m: r.pkg36m,
        createdAt: r.createdAt, updatedAt: r.updatedAt,
        totalUsers: parseInt(r.total_users),
        activeUsers: parseInt(r.active_users),
        totalDevices: parseInt(r.total_devices),
        onlineDevices: parseInt(r.online_devices),
        totalMedia: parseInt(r.total_media),
        totalMediaSizeBytes: parseInt(r.total_media_size),
        totalPlaylists: parseInt(r.total_playlists),
        totalSchedules: parseInt(r.total_schedules),
        licensedDevices: parseInt(r.licensed_devices),
    }));
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


// ─── SUPER_ADMIN: delete organization ────────────────────────────────────────

export async function deleteOrganization(orgId: string, requesterId: string): Promise<void> {
    // Block deleting own org
    const requester = await queryOne<{ organizationId: string }>(
        `SELECT "organizationId" FROM users WHERE id = $1`,
        [requesterId]
    );
    if (requester?.organizationId === orgId) {
        throw new AppError(400, 'Không thể xóa tổ chức của chính mình');
    }

    const org = await queryOne<{ id: string }>(
        `SELECT id FROM organizations WHERE id = $1`,
        [orgId]
    );
    if (!org) throw new AppError(404, 'Organization không tồn tại');

    // Cascade delete — all child tables have ON DELETE CASCADE
    await query(`DELETE FROM organizations WHERE id = $1`, [orgId]);
    logger.info('Organization deleted', { orgId, by: requesterId });
}

// ─── SUPER_ADMIN: update org settings ────────────────────────────────────────

export async function updateOrgSettings(
    orgId: string,
    settings: Record<string, unknown>
): Promise<OrganizationRow> {
    // Merge with existing settings
    const existing = await queryOne<{ settings: Record<string, unknown> }>(
        `SELECT settings FROM organizations WHERE id = $1`,
        [orgId]
    );
    if (!existing) throw new AppError(404, 'Organization không tồn tại');

    const merged = { ...(existing.settings ?? {}), ...settings };
    const rows = await query<OrganizationRow>(
        `UPDATE organizations
         SET settings = $1, "updatedAt" = NOW()
         WHERE id = $2
         RETURNING ${ORG_FIELDS}`,
        [JSON.stringify(merged), orgId]
    );
    if (!rows[0]) throw new AppError(404, 'Organization không tồn tại');
    logger.info('Org settings updated by super admin', { orgId });
    return rows[0];
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
