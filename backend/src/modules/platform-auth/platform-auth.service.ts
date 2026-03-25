import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne } from '../../shared/database/db';
import redis from '../../shared/cache/redis';
import config from '../../config';
import { AppError } from '../../shared/middleware/error.middleware';
import logger from '../../shared/utils/logger';

const BCRYPT_ROUNDS = 12;
const REFRESH_TTL = 30 * 24 * 60 * 60; // 30 days

export interface PlatformAdmin {
    id: string;
    email: string;
    name: string;
    isActive: boolean;
    lastLoginAt: string | null;
    createdAt: string;
    updatedAt: string;
}

interface PlatformAdminRow extends PlatformAdmin {
    passwordHash: string;
}

function signAccessToken(adminId: string) {
    return jwt.sign(
        { userId: adminId, organizationId: '', role: 'PLATFORM_ADMIN', type: 'platform_admin' },
        config.jwt.secret,
        { expiresIn: '2h' }
    );
}

function signRefreshToken(tokenId: string, adminId: string) {
    return jwt.sign(
        { tokenId, userId: adminId, type: 'pa_refresh' },
        config.jwt.secret,
        { expiresIn: '30d' }
    );
}

// ─── Login ────────────────────────────────────────────────────────────────────

export async function loginPlatformAdmin(email: string, password: string) {
    const admin = await queryOne<PlatformAdminRow>(
        `SELECT id, email, "passwordHash", name, "isActive", "lastLoginAt", "createdAt", "updatedAt"
         FROM platform_admins WHERE LOWER(email) = LOWER($1)`,
        [email]
    );
    if (!admin) throw new AppError(401, 'Email hoặc mật khẩu không đúng');
    if (!admin.isActive) throw new AppError(403, 'Tài khoản đã bị vô hiệu hóa');

    const ok = await bcrypt.compare(password, admin.passwordHash);
    if (!ok) throw new AppError(401, 'Email hoặc mật khẩu không đúng');

    await query(`UPDATE platform_admins SET "lastLoginAt" = NOW() WHERE id = $1`, [admin.id]);

    const tokenId = uuidv4();
    const accessToken = signAccessToken(admin.id);
    const refreshToken = signRefreshToken(tokenId, admin.id);
    await redis.set(`pa_refresh:${tokenId}`, admin.id, 'EX', REFRESH_TTL);

    logger.info('Platform admin login', { adminId: admin.id, email: admin.email });

    const { passwordHash: _, ...publicAdmin } = admin;
    return { accessToken, refreshToken, admin: publicAdmin };
}

// ─── Refresh ──────────────────────────────────────────────────────────────────

export async function refreshPlatformToken(refreshToken: string) {
    let payload: { tokenId: string; userId: string; type: string };
    try {
        payload = jwt.verify(refreshToken, config.jwt.secret) as typeof payload;
    } catch {
        throw new AppError(401, 'Invalid refresh token');
    }
    if (payload.type !== 'pa_refresh') throw new AppError(401, 'Invalid token type');

    const stored = await redis.get(`pa_refresh:${payload.tokenId}`);
    if (!stored) throw new AppError(401, 'Refresh token đã hết hạn hoặc bị thu hồi');

    const admin = await queryOne<PlatformAdminRow>(
        `SELECT id, email, "passwordHash", name, "isActive", "lastLoginAt", "createdAt", "updatedAt"
         FROM platform_admins WHERE id = $1`,
        [payload.userId]
    );
    if (!admin || !admin.isActive) throw new AppError(401, 'Tài khoản không còn hợp lệ');

    // Rotate token
    await redis.del(`pa_refresh:${payload.tokenId}`);
    const newTokenId = uuidv4();
    const newAccessToken = signAccessToken(admin.id);
    const newRefreshToken = signRefreshToken(newTokenId, admin.id);
    await redis.set(`pa_refresh:${newTokenId}`, admin.id, 'EX', REFRESH_TTL);

    const { passwordHash: _, ...publicAdmin } = admin;
    return { accessToken: newAccessToken, refreshToken: newRefreshToken, admin: publicAdmin };
}

// ─── Logout ───────────────────────────────────────────────────────────────────

export async function logoutPlatformAdmin(refreshToken: string): Promise<void> {
    try {
        const payload = jwt.verify(refreshToken, config.jwt.secret) as { tokenId: string; type: string };
        if (payload.type === 'pa_refresh') {
            await redis.del(`pa_refresh:${payload.tokenId}`);
        }
    } catch { /* expired token — already revoked */ }
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export async function listPlatformAdmins(): Promise<PlatformAdmin[]> {
    return query<PlatformAdmin>(
        `SELECT id, email, name, "isActive", "lastLoginAt", "createdAt", "updatedAt"
         FROM platform_admins ORDER BY "createdAt" DESC`,
        []
    );
}

export async function createPlatformAdmin(email: string, password: string, name: string): Promise<PlatformAdmin> {
    const existing = await queryOne(`SELECT id FROM platform_admins WHERE LOWER(email) = LOWER($1)`, [email]);
    if (existing) throw new AppError(409, 'Email đã được sử dụng');

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const result = await queryOne<PlatformAdmin>(
        `INSERT INTO platform_admins (id, email, "passwordHash", name, "isActive", "createdAt", "updatedAt")
         VALUES (gen_random_uuid()::text, $1, $2, $3, true, NOW(), NOW())
         RETURNING id, email, name, "isActive", "lastLoginAt", "createdAt", "updatedAt"`,
        [email, passwordHash, name]
    );
    if (!result) throw new AppError(500, 'Tạo platform admin thất bại');
    logger.info('Platform admin created', { email });
    return result;
}

export async function updatePlatformAdmin(
    id: string,
    data: { name?: string; password?: string; isActive?: boolean }
): Promise<PlatformAdmin> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let p = 1;

    if (data.name !== undefined)     { fields.push(`name = $${p++}`);        values.push(data.name); }
    if (data.isActive !== undefined) { fields.push(`"isActive" = $${p++}`);  values.push(data.isActive); }
    if (data.password) {
        const hash = await bcrypt.hash(data.password, BCRYPT_ROUNDS);
        fields.push(`"passwordHash" = $${p++}`);
        values.push(hash);
    }
    if (!fields.length) throw new AppError(400, 'Không có dữ liệu để cập nhật');

    fields.push(`"updatedAt" = NOW()`);
    values.push(id);

    const result = await queryOne<PlatformAdmin>(
        `UPDATE platform_admins SET ${fields.join(', ')} WHERE id = $${p}
         RETURNING id, email, name, "isActive", "lastLoginAt", "createdAt", "updatedAt"`,
        values
    );
    if (!result) throw new AppError(404, 'Platform admin không tồn tại');
    return result;
}

export async function deletePlatformAdmin(id: string, requesterId: string): Promise<void> {
    if (id === requesterId) throw new AppError(400, 'Không thể xóa chính mình');
    const result = await queryOne<{ id: string }>(
        `DELETE FROM platform_admins WHERE id = $1 RETURNING id`, [id]
    );
    if (!result) throw new AppError(404, 'Platform admin không tồn tại');
    logger.info('Platform admin deleted', { id });
}
