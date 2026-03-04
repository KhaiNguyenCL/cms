import { queryOne } from '../database/db';
import { AppError } from '../middleware/error.middleware';

function fmtBytes(b: number): string {
    if (b < 1024 ** 2) return `${(b / 1024).toFixed(0)} KB`;
    if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1)} MB`;
    return `${(b / 1024 ** 3).toFixed(2)} GB`;
}

export async function checkDeviceQuota(organizationId: string): Promise<void> {
    const res = await queryOne<{ used: string; max: number }>(
        `SELECT (SELECT COUNT(*) FROM devices WHERE "organizationId" = $1) AS used,
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
    const res = await queryOne<{ used: string; quota: string }>(
        `SELECT (SELECT COALESCE(SUM("fileSize"), 0) FROM media WHERE "organizationId" = $1) AS used,
                "storageQuotaBytes" AS quota
         FROM organizations WHERE id = $1`,
        [organizationId]
    );
    if (!res) return;
    const used = parseInt(res.used);
    const quota = parseInt(res.quota);
    if (used + incomingBytes > quota) {
        throw new AppError(413, `Không đủ dung lượng. Đã dùng ${fmtBytes(used)} / ${fmtBytes(quota)}.`);
    }
}
