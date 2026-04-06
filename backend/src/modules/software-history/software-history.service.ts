import { query, queryOne } from '../../shared/database/db';
import { AppError } from '../../shared/middleware/error.middleware';
import logger from '../../shared/utils/logger';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AppVersion {
    id: string;
    organizationId: string | null;
    versionName: string;
    versionCode: number;
    downloadUrl: string;
    releaseNotes: string | null;
    isLatest: boolean;
    createdAt: string;
}

export interface SoftwareDevice {
    id: string;
    name: string;
    status: string;
    appVersion: string | null;
    osVersion: string | null;
    model: string | null;
    lastSeen: string | null;
    storeId: string | null;
    storeName: string | null;
    organizationId: string;
    latestVersion: string | null;   // latest version available for this org
    isOutdated: boolean;
}

export interface VersionLog {
    id: string;
    deviceId: string;
    deviceName: string;
    fromVersion: string | null;
    toVersion: string;
    method: string;       // HEARTBEAT | OTA | ROLLBACK
    triggeredBy: string | null;
    occurredAt: string;
}

// ─── Version catalog ──────────────────────────────────────────────────────────

export async function listVersions(organizationId: string): Promise<AppVersion[]> {
    return query<AppVersion>(
        `SELECT id, "organizationId", "versionName", "versionCode",
                "downloadUrl", "releaseNotes", "isLatest", "createdAt"
         FROM app_versions
         WHERE "organizationId" = $1 OR "organizationId" IS NULL
         ORDER BY "versionCode" DESC, "createdAt" DESC`,
        [organizationId]
    );
}

export async function getLatestVersion(organizationId: string): Promise<AppVersion | null> {
    return queryOne<AppVersion>(
        `SELECT id, "organizationId", "versionName", "versionCode",
                "downloadUrl", "releaseNotes", "isLatest", "createdAt"
         FROM app_versions
         WHERE ("organizationId" = $1 OR "organizationId" IS NULL) AND "isLatest" = true
         ORDER BY "versionCode" DESC LIMIT 1`,
        [organizationId]
    );
}

export async function createVersion(
    organizationId: string,
    data: { versionName: string; versionCode: number; downloadUrl: string; releaseNotes?: string; isLatest?: boolean }
): Promise<AppVersion> {
    if (data.isLatest) {
        // Unset existing latest for this org
        await query(
            `UPDATE app_versions SET "isLatest" = false
             WHERE ("organizationId" = $1 OR "organizationId" IS NULL)`,
            [organizationId]
        );
    }
    const row = await queryOne<AppVersion>(
        `INSERT INTO app_versions (id, "organizationId", "versionName", "versionCode", "downloadUrl", "releaseNotes", "isLatest", "createdAt")
         VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, NOW())
         RETURNING id, "organizationId", "versionName", "versionCode", "downloadUrl", "releaseNotes", "isLatest", "createdAt"`,
        [organizationId, data.versionName, data.versionCode, data.downloadUrl, data.releaseNotes ?? null, data.isLatest ?? false]
    );
    return row!;
}

export async function setLatestVersion(id: string, organizationId: string): Promise<AppVersion> {
    // Unset all existing latest
    await query(
        `UPDATE app_versions SET "isLatest" = false
         WHERE "organizationId" = $1 OR "organizationId" IS NULL`,
        [organizationId]
    );
    const row = await queryOne<AppVersion>(
        `UPDATE app_versions SET "isLatest" = true
         WHERE id = $1 AND ("organizationId" = $2 OR "organizationId" IS NULL)
         RETURNING id, "organizationId", "versionName", "versionCode", "downloadUrl", "releaseNotes", "isLatest", "createdAt"`,
        [id, organizationId]
    );
    if (!row) throw new AppError(404, 'Không tìm thấy phiên bản');
    return row;
}

export async function deleteVersion(id: string, organizationId: string): Promise<void> {
    const result = await query(
        `DELETE FROM app_versions WHERE id = $1 AND "organizationId" = $2 RETURNING id`,
        [id, organizationId]
    );
    if (!result[0]) throw new AppError(404, 'Không tìm thấy phiên bản');
}

// ─── Device list + update status ─────────────────────────────────────────────

export async function getSoftwareDevices(organizationId: string): Promise<SoftwareDevice[]> {
    const latest = await getLatestVersion(organizationId);
    const devices = await query<Omit<SoftwareDevice, 'latestVersion' | 'isOutdated'>>(
        `SELECT d.id, d.name, d.status, d."appVersion", d."osVersion", d.model,
                d."lastSeen", d."storeId", st.name AS "storeName", d."organizationId"
         FROM devices d
         LEFT JOIN stores st ON st.id = d."storeId"
         WHERE d."organizationId" = $1
         ORDER BY d.name`,
        [organizationId]
    );
    const latestName = latest?.versionName ?? null;
    return devices.map(d => ({
        ...d,
        latestVersion: latestName,
        isOutdated: !!(latestName && d.appVersion && d.appVersion !== latestName),
    }));
}

// ─── Version history per device ───────────────────────────────────────────────

export async function getDeviceVersionLogs(
    deviceId: string,
    organizationId: string,
    limit = 100
): Promise<VersionLog[]> {
    return query<VersionLog>(
        `SELECT vl.id, vl."deviceId", d.name AS "deviceName",
                vl."fromVersion", vl."toVersion", vl.method, vl."triggeredBy", vl."occurredAt"
         FROM device_version_logs vl
         JOIN devices d ON d.id = vl."deviceId"
         WHERE vl."deviceId" = $1 AND vl."organizationId" = $2
         ORDER BY vl."occurredAt" DESC
         LIMIT $3`,
        [deviceId, organizationId, limit]
    );
}

/** Called from heartbeat when appVersion changes. */
export async function logVersionChange(
    deviceId: string,
    organizationId: string,
    fromVersion: string | null,
    toVersion: string,
    method: 'HEARTBEAT' | 'OTA' | 'ROLLBACK' = 'HEARTBEAT',
    triggeredBy?: string
): Promise<void> {
    try {
        await query(
            `INSERT INTO device_version_logs
               (id, "deviceId", "organizationId", "fromVersion", "toVersion", method, "triggeredBy", "occurredAt")
             VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, NOW())`,
            [deviceId, organizationId, fromVersion ?? null, toVersion, method, triggeredBy ?? null]
        );
    } catch (err) {
        logger.warn('Failed to log version change', { deviceId, err });
    }
}

// ─── OTA push ────────────────────────────────────────────────────────────────

export async function pushOtaUpdate(
    deviceId: string,
    organizationId: string,
    versionId: string,
    triggeredBy: string
): Promise<{ versionName: string; downloadUrl: string }> {
    // Verify device belongs to org
    const dev = await queryOne<{ id: string; appVersion: string | null }>(
        `SELECT id, "appVersion" FROM devices WHERE id = $1 AND "organizationId" = $2`,
        [deviceId, organizationId]
    );
    if (!dev) throw new AppError(404, 'Device không tồn tại');

    const ver = await queryOne<AppVersion>(
        `SELECT * FROM app_versions WHERE id = $1 AND ("organizationId" = $2 OR "organizationId" IS NULL)`,
        [versionId, organizationId]
    );
    if (!ver) throw new AppError(404, 'Phiên bản không tồn tại');

    // Push command to device via socket
    const { pushCommandToDevice } = await import('../../shared/socket/socket.server');
    pushCommandToDevice(deviceId, 'OTA_UPDATE', {
        versionName: ver.versionName,
        versionCode: ver.versionCode,
        downloadUrl: ver.downloadUrl,
    });

    // Log pre-emptively (device will confirm via heartbeat)
    await logVersionChange(deviceId, organizationId, dev.appVersion, ver.versionName, 'OTA', triggeredBy);

    logger.info('OTA update pushed', { deviceId, versionName: ver.versionName });
    return { versionName: ver.versionName, downloadUrl: ver.downloadUrl };
}

export async function pushOtaToAll(
    organizationId: string,
    versionId: string,
    triggeredBy: string
): Promise<{ pushed: number }> {
    const ver = await queryOne<AppVersion>(
        `SELECT * FROM app_versions WHERE id = $1 AND ("organizationId" = $2 OR "organizationId" IS NULL)`,
        [versionId, organizationId]
    );
    if (!ver) throw new AppError(404, 'Phiên bản không tồn tại');

    // Only push to online devices that are outdated
    const devices = await query<{ id: string; appVersion: string | null }>(
        `SELECT id, "appVersion" FROM devices
         WHERE "organizationId" = $1
           AND status IN ('ONLINE','SLEEP')
           AND ("appVersion" IS NULL OR "appVersion" != $2)`,
        [organizationId, ver.versionName]
    );

    const { pushCommandToDevice } = await import('../../shared/socket/socket.server');
    for (const d of devices) {
        pushCommandToDevice(d.id, 'OTA_UPDATE', {
            versionName: ver.versionName,
            versionCode: ver.versionCode,
            downloadUrl: ver.downloadUrl,
        });
        await logVersionChange(d.id, organizationId, d.appVersion, ver.versionName, 'OTA', triggeredBy);
    }

    logger.info('OTA pushed to all outdated devices', { organizationId, count: devices.length });
    return { pushed: devices.length };
}

// ─── Outdated report ──────────────────────────────────────────────────────────

export async function getOutdatedReport(organizationId: string): Promise<{
    latestVersion: string | null;
    total: number;
    upToDate: number;
    outdated: number;
    unknown: number;
    devices: SoftwareDevice[];
}> {
    const all = await getSoftwareDevices(organizationId);
    const latest = all[0]?.latestVersion ?? null;
    const outdated = all.filter(d => d.isOutdated);
    const upToDate = all.filter(d => d.latestVersion && d.appVersion === d.latestVersion);
    const unknown  = all.filter(d => !d.appVersion);
    return {
        latestVersion: latest,
        total: all.length,
        upToDate: upToDate.length,
        outdated: outdated.length,
        unknown: unknown.length,
        devices: outdated,
    };
}
