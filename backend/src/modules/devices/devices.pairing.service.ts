import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { query, queryOne } from '../../shared/database/db';
import { AppError } from '../../shared/middleware/error.middleware';
import config from '../../config';
import logger from '../../shared/utils/logger';
import redis, { RedisKeys } from '../../shared/cache/redis';
import type { RegisterDeviceBody, DevicePairBody, BatchGeneratePairingCodesBody } from './devices.schema';

// Secret dùng để verify chữ ký từ Android app.
// Android app tính: HMAC-SHA256(JSON.stringify(deviceInfo), DEVICE_SIGN_SECRET)
const DEVICE_SIGN_SECRET = process.env.DEVICE_SIGN_SECRET ?? 'dev-device-sign-secret';
const CODE_TTL = config.devicePairing.codeTtlSeconds;
const TOKEN_TTL_DAYS = config.devicePairing.deviceTokenExpiryDays;

// ─── 1. Register device profile — Step 1 of 3 ────────────────────────────────

export async function registerDevice(
    organizationId: string,
    _userId: string,
    data: RegisterDeviceBody
): Promise<{ id: string; organizationId: string; name: string; pairingCode: null }> {
    const rows = await query<{ id: string; organizationId: string; name: string; pairingCode: null }>(
        `INSERT INTO devices (id, "organizationId", name, location, timezone, status, "createdAt", "updatedAt")
         VALUES (gen_random_uuid()::text, $1, $2, $3, $4, 'OFFLINE', NOW(), NOW())
         RETURNING id, "organizationId", name, "pairingCode"`,
        [organizationId, data.name, data.location ?? null, data.timezone ?? 'Asia/Ho_Chi_Minh']
    );
    logger.info('Device registered (step 1)', { deviceId: rows[0].id, organizationId });
    return rows[0];
}

// ─── 2. Generate pairing code — Step 2 of 3 ──────────────────────────────────

export async function generatePairingCode(
    deviceId: string,
    organizationId: string,
    _userId: string,
    ip: string
): Promise<{ deviceId: string; pairingCode: string; expiresIn: number }> {
    const device = await queryOne<{ id: string }>(
        `SELECT id FROM devices WHERE id = $1 AND "organizationId" = $2`,
        [deviceId, organizationId]
    );
    if (!device) throw new AppError(404, 'Device không tồn tại');

    // Tạo 6 chữ số, đảm bảo duy nhất
    let code = '';
    for (let attempt = 0; attempt < 10; attempt++) {
        code = String(Math.floor(100000 + Math.random() * 900000));
        const taken = await queryOne<{ id: string }>(
            `SELECT id FROM devices WHERE "pairingCode" = $1`, [code]
        );
        if (!taken) break;
    }

    // Lưu code vào DB + TTL trong Redis
    await query(
        `UPDATE devices SET "pairingCode" = $1, "updatedAt" = NOW() WHERE id = $2`,
        [code, deviceId]
    );
    await redis.setex(RedisKeys.pairingCode(code), CODE_TTL, deviceId);

    logger.info('Pairing code generated', { deviceId, ip });
    return { deviceId, pairingCode: code, expiresIn: CODE_TTL };
}

// ─── 3. Pair device — Step 3 of 3 ────────────────────────────────────────────

export async function pairDevice(
    data: DevicePairBody,
    ip: string
): Promise<{ token: string; deviceId: string; organizationId: string; name: string }> {
    // Tìm device theo pairingCode:
    // - New flow: code lưu trong Redis (có TTL 5 phút) → dùng Redis ID để query DB
    // - Legacy flow: code chỉ có trong DB (tạo từ POST /api/devices) → query DB trực tiếp
    const storedDeviceId = await redis.get(RedisKeys.pairingCode(data.pairingCode));

    const device = await queryOne<{ id: string; organizationId: string; name: string }>(
        storedDeviceId
            ? `SELECT id, "organizationId", name FROM devices WHERE id = $1 AND "pairingCode" = $2`
            : `SELECT id, "organizationId", name FROM devices WHERE "pairingCode" = $1`,
        storedDeviceId
            ? [storedDeviceId, data.pairingCode]
            : [data.pairingCode]
    );
    if (!device) throw new AppError(400, 'Mã ghép cặp không hợp lệ hoặc đã hết hạn');

    // Xác thực chữ ký Android app
    const expectedSig = crypto
        .createHmac('sha256', DEVICE_SIGN_SECRET)
        .update(JSON.stringify(data.deviceInfo))
        .digest('hex');
    if (data.signature !== expectedSig) {
        logger.warn('Device signature mismatch', { deviceId: device.id, ip });
        throw new AppError(401, 'Xác thực thiết bị thất bại');
    }

    // If this TV was previously paired with a different device profile,
    // release it from that old profile before claiming it here.
    // This avoids the unique constraint violation on androidId.
    await query(
        `UPDATE devices SET "androidId" = NULL, status = 'OFFLINE', "updatedAt" = NOW()
         WHERE "androidId" = $1 AND id != $2`,
        [data.deviceInfo.hwId, device.id]
    );

    // Cập nhật thông tin device, xóa pairingCode
    await query(
        `UPDATE devices
         SET "androidId" = $1, "osVersion" = $2, "appVersion" = $3,
             "pairingCode" = NULL, status = 'ONLINE', "lastSeen" = NOW(), "updatedAt" = NOW()
         WHERE id = $4`,
        [data.deviceInfo.hwId, data.deviceInfo.osVersion, data.deviceInfo.appVersion, device.id]
    );

    // Xóa code khỏi Redis
    await redis.del(RedisKeys.pairingCode(data.pairingCode));

    // Clear any blacklist entry — device may have been reset before re-pairing.
    // Without this, the new token would still return 401 since the device ID is the same.
    await redis.del(RedisKeys.deviceBlacklist(device.id));

    // Cấp device JWT
    const token = jwt.sign(
        { userId: device.id, organizationId: device.organizationId, role: 'DEVICE', type: 'device' },
        config.jwt.secret,
        { expiresIn: `${TOKEN_TTL_DAYS}d` }
    );

    logger.info('Device paired', { deviceId: device.id, ip });
    return { token, deviceId: device.id, organizationId: device.organizationId, name: device.name };
}

// ─── Refresh device token ─────────────────────────────────────────────────────

export async function refreshDeviceToken(
    deviceId: string,
    organizationId: string
): Promise<{ token: string }> {
    const device = await queryOne<{ id: string }>(
        `SELECT id FROM devices WHERE id = $1 AND "organizationId" = $2`,
        [deviceId, organizationId]
    );
    if (!device) throw new AppError(404, 'Device không tồn tại');

    const token = jwt.sign(
        { userId: deviceId, organizationId, role: 'DEVICE', type: 'device' },
        config.jwt.secret,
        { expiresIn: `${TOKEN_TTL_DAYS}d` }
    );

    logger.info('Device token refreshed', { deviceId });
    return { token };
}

// ─── Batch generate pairing codes ────────────────────────────────────────────

export async function batchGeneratePairingCodes(
    organizationId: string,
    userId: string,
    ip: string,
    data: BatchGeneratePairingCodesBody
): Promise<Array<{ deviceId: string; name: string; pairingCode: string }>> {
    const results: Array<{ deviceId: string; name: string; pairingCode: string }> = [];

    if (data.deviceIds && data.deviceIds.length > 0) {
        for (const deviceId of data.deviceIds) {
            const { pairingCode } = await generatePairingCode(deviceId, organizationId, userId, ip);
            const device = await queryOne<{ name: string }>(
                `SELECT name FROM devices WHERE id = $1`, [deviceId]
            );
            results.push({ deviceId, name: device?.name ?? deviceId, pairingCode });
        }
    } else if (data.count) {
        const prefix = data.baseNamePrefix ?? 'Device';
        for (let i = 1; i <= data.count; i++) {
            const name = `${prefix} ${String(i).padStart(3, '0')}`;
            const created = await registerDevice(organizationId, userId, { name });
            const { pairingCode } = await generatePairingCode(created.id, organizationId, userId, ip);
            results.push({ deviceId: created.id, name, pairingCode });
        }
    }

    logger.info('Batch pairing codes generated', { count: results.length, organizationId });
    return results;
}
