import { queryOne } from '../database/db';
import { AppError } from '../middleware/error.middleware';

function fmtBytes(b: number): string {
    if (b < 1024 ** 2) return `${(b / 1024).toFixed(0)} KB`;
    if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1)} MB`;
    return `${(b / 1024 ** 3).toFixed(2)} GB`;
}

export async function checkDeviceQuota(organizationId: string): Promise<void> {
    const res = await queryOne<{ used: string; max: number }>(
        `SELECT (SELECT COUNT(*) FROM devices WHERE "organizationId" = $1 AND "deletedAt" IS NULL) AS used,
                "maxDevices" AS max
         FROM organizations WHERE id = $1`,
        [organizationId]
    );
    if (!res) return;
    if (parseInt(res.used) >= res.max) {
        throw new AppError(403, `Đã đạt giới hạn ${res.max} thiết bị. Liên hệ Admin để nâng cấp.`);
    }
}

export async function checkUserQuota(organizationId: string): Promise<void> {
    const res = await queryOne<{ used: string; max: number }>(
        `SELECT (SELECT COUNT(*) FROM users WHERE "organizationId" = $1 AND status != 'SUSPENDED') AS used,
                "maxUsers" AS max
         FROM organizations WHERE id = $1`,
        [organizationId]
    );
    if (!res) return;
    if (parseInt(res.used) >= res.max) {
        throw new AppError(403, `Đã đạt giới hạn ${res.max} người dùng. Liên hệ Admin để nâng cấp.`);
    }
}

export async function checkStorageQuota(organizationId: string, incomingBytes: number): Promise<void> {
    const res = await queryOne<{ used: string; baseMb: number; ext50: number; ext100: number; ext200: number }>(
        `SELECT (SELECT COALESCE(SUM("fileSize"), 0) FROM media WHERE "organizationId" = $1 AND "deletedAt" IS NULL)::text AS used,
                "storageBaseMb" AS "baseMb", "ext50mb" AS "ext50", "ext100mb" AS "ext100", "ext200mb" AS "ext200"
         FROM organizations WHERE id = $1`,
        [organizationId]
    );
    if (!res) return;
    const used = parseInt(res.used);
    const totalQuotaMb = res.baseMb + res.ext50 * 50 + res.ext100 * 100 + res.ext200 * 200;
    const quota = totalQuotaMb * 1024 * 1024;
    if (used + incomingBytes > quota) {
        throw new AppError(413, `Không đủ dung lượng. Đã dùng ${fmtBytes(used)} / ${fmtBytes(quota)}.`);
    }
    // Fire storage warning notifications (non-blocking, dedupe via 24h cooldown)
    const pctAfter = quota > 0 ? ((used + incomingBytes) / quota) * 100 : 0;
    if (pctAfter >= 100) {
        import('../../modules/notifications/notifications.service')
            .then(({ createNotification, NOTIF_TYPES }) =>
                createNotification(organizationId, NOTIF_TYPES.STORAGE_FULL,
                    'Dung lượng đã đầy',
                    `Đã dùng ${fmtBytes(used + incomingBytes)} / ${fmtBytes(quota)}`,
                    organizationId, 'storage')
            ).catch(() => {});
    } else if (pctAfter >= 80) {
        import('../../modules/notifications/notifications.service')
            .then(({ createNotification, NOTIF_TYPES }) =>
                createNotification(organizationId, NOTIF_TYPES.STORAGE_NEARLY_FULL,
                    `Dung lượng sắp đầy (${Math.round(pctAfter)}%)`,
                    `Đã dùng ${fmtBytes(used + incomingBytes)} / ${fmtBytes(quota)}`,
                    organizationId, 'storage')
            ).catch(() => {});
    }
}
