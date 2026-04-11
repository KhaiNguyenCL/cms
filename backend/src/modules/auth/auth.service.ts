import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne, withTransaction } from '../../shared/database/db';
import redis from '../../shared/cache/redis';
import config from '../../config';
import { AppError } from '../../shared/middleware/error.middleware';
import logger from '../../shared/utils/logger';
import type { RegisterBody, LoginBody } from './auth.schema';

const BCRYPT_ROUNDS = 12;
const REFRESH_TOKEN_TTL_SEC = 30 * 24 * 60 * 60; // 30 ngày
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_SECONDS = 15 * 60; // 15 phút

// ─── Types ────────────────────────────────────────────────────────────────────

interface UserRow {
    id: string;
    email: string;
    password_hash: string;
    role: string;
    status: string;
    organization_id: string;
    is_root: boolean;
    created_at: string;
    updated_at: string;
}

// Dạng user trả về cho frontend (không có password_hash)
export interface UserPublic {
    id: string;
    organizationId: string;
    email: string;
    role: string;
    status: string;
    isRoot: boolean;
    createdAt: string;
    updatedAt: string;
}

function toPublicUser(u: UserRow): UserPublic {
    return {
        id: u.id,
        organizationId: u.organization_id,
        email: u.email,
        role: u.role,
        status: u.status,
        isRoot: u.is_root ?? false,
        createdAt: u.created_at,
        updatedAt: u.updated_at,
    };
}

// ─── Token helpers ────────────────────────────────────────────────────────────

function signAccessToken(payload: { userId: string; organizationId: string; role: string; isRoot?: boolean }) {
    return jwt.sign({ ...payload, type: 'user' }, config.jwt.secret, { expiresIn: '2h' });
}

function signRefreshToken(tokenId: string, userId: string) {
    return jwt.sign({ tokenId, userId, type: 'refresh' }, config.jwt.secret, { expiresIn: '30d' });
}

async function generateTokenPair(user: UserRow) {
    const tokenId = uuidv4();
    const accessToken = signAccessToken({
        userId: user.id,
        organizationId: user.organization_id,
        role: user.role,
        isRoot: user.is_root ?? false,
    });
    const refreshToken = signRefreshToken(tokenId, user.id);
    await redis.set(`refresh:${tokenId}`, user.id, 'EX', REFRESH_TOKEN_TTL_SEC);
    // Track tokenId per user để tránh dùng KEYS khi cần revoke toàn bộ
    await redis.sadd(`user_tokens:${user.id}`, tokenId);
    await redis.expire(`user_tokens:${user.id}`, REFRESH_TOKEN_TTL_SEC);
    return { accessToken, refreshToken, user: toPublicUser(user) };
}

// ─── Login attempt limiter ─────────────────────────────────────────────────────

async function checkLoginAttempts(email: string, ip: string) {
    if (config.env !== 'production') return;
    const key = `login_attempts:${email}:${ip}`;
    const attempts = await redis.get(key);
    if (attempts && parseInt(attempts) >= MAX_LOGIN_ATTEMPTS) {
        const ttl = await redis.ttl(key);
        throw new AppError(429, `Quá nhiều lần đăng nhập sai. Thử lại sau ${Math.ceil(ttl / 60)} phút.`);
    }
}

async function recordFailedAttempt(email: string, ip: string) {
    if (config.env !== 'production') return;
    const key = `login_attempts:${email}:${ip}`;
    const attempts = await redis.incr(key);
    if (attempts === 1) await redis.expire(key, LOCKOUT_SECONDS);
}

async function clearLoginAttempts(email: string, ip: string) {
    if (config.env !== 'production') return;
    await redis.del(`login_attempts:${email}:${ip}`);
}

// ─── Register ─────────────────────────────────────────────────────────────────

export async function register(data: RegisterBody) {
    // Kiểm tra slug đã tồn tại
    const existingOrg = await queryOne(
        'SELECT id FROM organizations WHERE slug = $1',
        [data.organizationSlug]
    );
    if (existingOrg) throw new AppError(409, 'Organization slug đã được sử dụng');

    // Kiểm tra email đã tồn tại
    const existingUser = await queryOne(
        'SELECT id FROM users WHERE email = $1',
        [data.email]
    );
    if (existingUser) throw new AppError(409, 'Email đã được sử dụng');

    const passwordHash = await bcrypt.hash(data.password, BCRYPT_ROUNDS);

    const user = await withTransaction(async (client) => {
        // Tạo organization
        const orgResult = await client.query(
            `INSERT INTO organizations (id, name, slug, "isActive", "createdAt", "updatedAt")
             VALUES (gen_random_uuid()::text, $1, $2, true, NOW(), NOW())
             RETURNING id`,
            [data.organizationName, data.organizationSlug]
        );
        const orgId = orgResult.rows[0].id;

        // Tạo user admin đầu tiên
        const userResult = await client.query(
            `INSERT INTO users (id, "organizationId", email, "passwordHash", role, status, "createdAt", "updatedAt")
             VALUES (gen_random_uuid()::text, $1, $2, $3, 'ADMIN', 'ACTIVE', NOW(), NOW())
             RETURNING id, email, '' as password_hash, role, status,
                       "organizationId" as organization_id,
                       "createdAt" as created_at, "updatedAt" as updated_at`,
            [orgId, data.email, passwordHash]
        );
        return userResult.rows[0] as UserRow;
    });

    logger.info('New organization registered', { userId: user.id });
    return generateTokenPair(user);
}

// ─── Login ────────────────────────────────────────────────────────────────────

export async function login(data: LoginBody, ip: string) {
    await checkLoginAttempts(data.email, ip);

    const user = await queryOne<UserRow & { org_active: boolean }>(
        `SELECT u.id, u.email, u."passwordHash" as password_hash, u.role, u.status,
                u."organizationId" as organization_id, u."isRoot" as is_root,
                u."createdAt" as created_at, u."updatedAt" as updated_at,
                o."isActive" as org_active
         FROM users u
         JOIN organizations o ON o.id = u."organizationId"
         WHERE u.email = $1`,
        [data.email]
    );

    if (!user) {
        await recordFailedAttempt(data.email, ip);
        throw new AppError(401, 'Email hoặc mật khẩu không đúng');
    }

    if (!user.org_active) {
        throw new AppError(403, 'Tổ chức đã bị vô hiệu hoá');
    }

    if (user.status !== 'ACTIVE') {
        throw new AppError(403, 'Tài khoản đã bị vô hiệu hoá');
    }

    const passwordMatch = await bcrypt.compare(data.password, user.password_hash);
    if (!passwordMatch) {
        await recordFailedAttempt(data.email, ip);
        throw new AppError(401, 'Email hoặc mật khẩu không đúng');
    }

    await clearLoginAttempts(data.email, ip);
    logger.info('User logged in', { userId: user.id });
    return generateTokenPair(user);
}

// ─── Refresh Token ─────────────────────────────────────────────────────────────

const GRACE_PERIOD_SEC = 30; // seconds after rotation where old token is still accepted

export async function refreshAccessToken(refreshToken: string) {
    let payload: any;
    try {
        payload = jwt.verify(refreshToken, config.jwt.secret);
    } catch {
        throw new AppError(401, 'Refresh token không hợp lệ hoặc đã hết hạn');
    }
    if (payload.type !== 'refresh') throw new AppError(401, 'Token không đúng loại');

    const storedUserId = await redis.get(`refresh:${payload.tokenId}`);

    if (!storedUserId) {
        // Token may have just been rotated by another tab — check grace period
        const graceUserId = await redis.get(`refresh:grace:${payload.tokenId}`);
        if (!graceUserId || graceUserId !== payload.userId) {
            throw new AppError(401, 'Refresh token đã bị thu hồi');
        }
        // Within grace period: still serve a fresh token pair to avoid logout
        logger.debug('Refresh token in grace period, issuing new pair', { tokenId: payload.tokenId });
        const graceUser = await queryOne<UserRow & { org_active: boolean }>(
            `SELECT u.id, u.email, '' as password_hash, u.role, u.status,
                    u."organizationId" as organization_id, u."isRoot" as is_root,
                    u."createdAt" as created_at, u."updatedAt" as updated_at,
                    o."isActive" as org_active
             FROM users u
             JOIN organizations o ON o.id = u."organizationId"
             WHERE u.id = $1`,
            [graceUserId]
        );
        if (!graceUser || graceUser.status !== 'ACTIVE') throw new AppError(401, 'Tài khoản không hợp lệ');
        if (!graceUser.org_active) throw new AppError(401, 'Tổ chức đã bị vô hiệu hoá');
        return generateTokenPair(graceUser);
    }

    if (storedUserId !== payload.userId) {
        throw new AppError(401, 'Refresh token đã bị thu hồi');
    }

    const user = await queryOne<UserRow & { org_active: boolean }>(
        `SELECT u.id, u.email, '' as password_hash, u.role, u.status,
                u."organizationId" as organization_id, u."isRoot" as is_root,
                u."createdAt" as created_at, u."updatedAt" as updated_at,
                o."isActive" as org_active
         FROM users u
         JOIN organizations o ON o.id = u."organizationId"
         WHERE u.id = $1`,
        [payload.userId]
    );
    if (!user || user.status !== 'ACTIVE') throw new AppError(401, 'Tài khoản không hợp lệ');
    if (!user.org_active) throw new AppError(401, 'Tổ chức đã bị vô hiệu hoá');

    // Rotate: delete old token, keep grace entry so concurrent tabs don't get logged out
    await redis.srem(`user_tokens:${payload.userId}`, payload.tokenId);
    await redis.del(`refresh:${payload.tokenId}`);
    await redis.set(`refresh:grace:${payload.tokenId}`, payload.userId, 'EX', GRACE_PERIOD_SEC);
    return generateTokenPair(user);
}

// ─── Logout ───────────────────────────────────────────────────────────────────

export async function logout(refreshToken: string, userId: string) {
    try {
        const payload = jwt.verify(refreshToken, config.jwt.secret) as any;
        if (payload.tokenId) {
            await redis.srem(`user_tokens:${userId}`, payload.tokenId);
            await redis.del(`refresh:${payload.tokenId}`);
        }
    } catch {
        // Token invalid = đã logout rồi, không cần throw
    }
    logger.info('User logged out', { userId });
}

// ─── Pairing Code ─────────────────────────────────────────────────────────────

export async function generatePairingCode(organizationId: string): Promise<string> {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    await redis.set(`pairing:${code}`, organizationId, 'EX', 300);
    return code;
}

export async function pairDevice(
    pairingCode: string,
    deviceInfo: { name: string; androidId?: string; model?: string; osVersion?: string; appVersion?: string }
): Promise<{ deviceToken: string; deviceId: string }> {
    const organizationId = await redis.get(`pairing:${pairingCode}`);
    if (!organizationId) throw new AppError(400, 'Pairing code không hợp lệ hoặc đã hết hạn');

    await redis.del(`pairing:${pairingCode}`);

    const rows = await query<{ id: string }>(
        `INSERT INTO devices (id, "organizationId", name, "androidId", model, "osVersion", "appVersion",
                             status, "lastSeen", timezone, "createdAt", "updatedAt")
         VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6,
                 'ONLINE', NOW(), 'Asia/Ho_Chi_Minh', NOW(), NOW())
         RETURNING id`,
        [
            organizationId,
            deviceInfo.name,
            deviceInfo.androidId ?? null,
            deviceInfo.model ?? null,
            deviceInfo.osVersion ?? null,
            deviceInfo.appVersion ?? null,
        ]
    );
    const deviceId = rows[0].id;

    const deviceToken = jwt.sign(
        { deviceId, organizationId, type: 'device' },
        config.jwt.deviceSecret,
        { expiresIn: '365d' }
    );

    logger.info('Device paired', { deviceId, organizationId });
    return { deviceToken, deviceId };
}

// ─── Forgot Password ──────────────────────────────────────────────────────────

const RESET_TOKEN_TTL_SEC = 15 * 60; // 15 phút

export async function forgotPassword(email: string) {
    // Luôn trả về thành công để tránh user enumeration attack
    const user = await queryOne<{ id: string }>(
        'SELECT id FROM users WHERE email = $1 AND status = $2',
        [email, 'ACTIVE']
    );

    if (!user) {
        // Không tiết lộ email có tồn tại hay không
        return { message: 'Nếu email hợp lệ, bạn sẽ nhận được link đặt lại mật khẩu' };
    }

    // Tạo reset token ngẫu nhiên
    const resetToken = uuidv4();
    await redis.set(`reset_pwd:${resetToken}`, user.id, 'EX', RESET_TOKEN_TTL_SEC);

    logger.info('Password reset requested', { userId: user.id });

    // Trong production: gửi email chứa link reset
    // Trong dev: trả thẳng token để test
    const isDev = process.env.NODE_ENV === 'development';
    return {
        message: 'Nếu email hợp lệ, bạn sẽ nhận được link đặt lại mật khẩu',
        ...(isDev && { resetToken, expiresInMinutes: 15 }),
    };
}

// ─── Reset Password ───────────────────────────────────────────────────────────

export async function resetPassword(token: string, newPassword: string) {
    const userId = await redis.get(`reset_pwd:${token}`);
    if (!userId) {
        throw new AppError(400, 'Token đặt lại mật khẩu không hợp lệ hoặc đã hết hạn');
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

    await query(
        `UPDATE users SET "passwordHash" = $1, "updatedAt" = NOW() WHERE id = $2`,
        [passwordHash, userId]
    );

    // Xóa reset token
    await redis.del(`reset_pwd:${token}`);

    // Thu hồi tất cả refresh token hiện có (force logout trên tất cả thiết bị)
    const tokenIds = await redis.smembers(`user_tokens:${userId}`);
    if (tokenIds.length > 0) {
        const pipeline = redis.pipeline();
        for (const id of tokenIds) {
            pipeline.del(`refresh:${id}`);
        }
        pipeline.del(`user_tokens:${userId}`);
        await pipeline.exec();
    }

    logger.info('Password reset successful', { userId });
    return { message: 'Mật khẩu đã được đặt lại thành công. Vui lòng đăng nhập lại.' };
}
