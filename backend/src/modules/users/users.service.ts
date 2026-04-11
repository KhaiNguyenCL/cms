import bcrypt from 'bcrypt';
import { query, queryOne } from '../../shared/database/db';
import { AppError } from '../../shared/middleware/error.middleware';
import logger from '../../shared/utils/logger';
import type { CreateUserBody, UpdateUserBody, ListUsersQuery } from './users.schema';

const BCRYPT_ROUNDS = 12;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UserRow {
    id: string;
    organizationId: string;
    email: string;
    role: string;
    status: string;
    createdAt: string;
    updatedAt: string;
}

export interface PaginatedUsers {
    data: UserRow[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}

// ─── List users ───────────────────────────────────────────────────────────────

export async function listUsers(
    organizationId: string,
    q: ListUsersQuery
): Promise<PaginatedUsers> {
    const { page, limit, role, status, search } = q;
    const offset = (page - 1) * limit;

    const conditions: string[] = [`"organizationId" = $1`];
    const values: unknown[] = [organizationId];
    let idx = 2;

    if (role) {
        conditions.push(`role = $${idx++}`);
        values.push(role);
    }
    if (status) {
        conditions.push(`status = $${idx++}`);
        values.push(status);
    }
    if (search) {
        conditions.push(`email ILIKE $${idx++}`);
        values.push(`%${search}%`);
    }

    const where = conditions.join(' AND ');

    const [countResult, rows] = await Promise.all([
        queryOne<{ count: string }>(
            `SELECT COUNT(*) as count FROM users WHERE ${where}`,
            values
        ),
        query<UserRow>(
            `SELECT id, "organizationId", email, role, status, "createdAt", "updatedAt"
             FROM users
             WHERE ${where}
             ORDER BY "createdAt" DESC
             LIMIT $${idx++} OFFSET $${idx++}`,
            [...values, limit, offset]
        ),
    ]);

    const total = parseInt(countResult?.count ?? '0');

    return {
        data: rows,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
    };
}

// ─── Get single user ──────────────────────────────────────────────────────────

export async function getUserById(userId: string, organizationId: string): Promise<UserRow> {
    const user = await queryOne<UserRow>(
        `SELECT id, "organizationId", email, role, status, "createdAt", "updatedAt"
         FROM users
         WHERE id = $1 AND "organizationId" = $2`,
        [userId, organizationId]
    );
    if (!user) throw new AppError(404, 'User không tồn tại');
    return user;
}

// ─── Create user ──────────────────────────────────────────────────────────────

export async function createUser(
    organizationId: string,
    createdById: string,
    data: CreateUserBody
): Promise<UserRow> {
    // Check email unique within org
    const existing = await queryOne(
        `SELECT id FROM users WHERE email = $1`,
        [data.email]
    );
    if (existing) throw new AppError(409, 'Email đã được sử dụng');

    const passwordHash = await bcrypt.hash(data.password, BCRYPT_ROUNDS);

    const rows = await query<UserRow>(
        `INSERT INTO users (id, "organizationId", email, "passwordHash", role, status, "createdAt", "updatedAt")
         VALUES (gen_random_uuid()::text, $1, $2, $3, $4, 'ACTIVE', NOW(), NOW())
         RETURNING id, "organizationId", email, role, status, "createdAt", "updatedAt"`,
        [organizationId, data.email, passwordHash, data.role]
    );

    logger.info('User created', { createdBy: createdById, newUserId: rows[0].id });
    import('../../modules/notifications/notifications.service')
        .then(({ createNotification, NOTIF_TYPES }) =>
            createNotification(organizationId, NOTIF_TYPES.USER_CREATED,
                `Người dùng mới: ${data.email}`,
                `Vai trò: ${data.role}`,
                rows[0].id, 'user')
        ).catch(() => {});
    return rows[0];
}

// ─── Update user ──────────────────────────────────────────────────────────────

export async function updateUser(
    userId: string,
    organizationId: string,
    requesterId: string,
    data: UpdateUserBody
): Promise<UserRow> {
    // Lấy user hiện tại để check
    const target = await queryOne<UserRow>(
        `SELECT id, role FROM users WHERE id = $1 AND "organizationId" = $2`,
        [userId, organizationId]
    );
    if (!target) throw new AppError(404, 'User không tồn tại');

    // SUPER_ADMIN không thể bị chỉnh sửa qua Users API
    if (target.role === 'SUPER_ADMIN') {
        throw new AppError(403, 'Không thể chỉnh sửa tài khoản SUPER_ADMIN');
    }

    // Không cho phép hạ cấp/deactivate chính mình
    if (userId === requesterId && data.status === 'INACTIVE') {
        throw new AppError(400, 'Không thể tự vô hiệu hoá tài khoản của mình');
    }

    const fields: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (data.email !== undefined) {
        const existing = await queryOne(`SELECT id FROM users WHERE email = $1 AND id != $2`, [data.email, userId]);
        if (existing) throw new AppError(409, 'Email đã được sử dụng');
        fields.push(`email = $${paramIndex++}`);
        values.push(data.email);
    }
    if (data.password !== undefined) {
        const passwordHash = await bcrypt.hash(data.password, BCRYPT_ROUNDS);
        fields.push(`"passwordHash" = $${paramIndex++}`);
        values.push(passwordHash);
    }
    if (data.role !== undefined) {
        fields.push(`role = $${paramIndex++}`);
        values.push(data.role);
    }
    if (data.status !== undefined) {
        fields.push(`status = $${paramIndex++}`);
        values.push(data.status);
    }

    if (fields.length === 0) throw new AppError(400, 'Không có dữ liệu để cập nhật');

    fields.push(`"updatedAt" = NOW()`);
    values.push(userId, organizationId);

    const rows = await query<UserRow>(
        `UPDATE users
         SET ${fields.join(', ')}
         WHERE id = $${paramIndex++} AND "organizationId" = $${paramIndex++}
         RETURNING id, "organizationId", email, role, status, "createdAt", "updatedAt"`,
        values
    );

    if (!rows[0]) throw new AppError(404, 'User không tồn tại');
    logger.info('User updated', { requesterId, targetUserId: userId });
    return rows[0];
}

// ─── Delete user ──────────────────────────────────────────────────────────────

export async function deleteUser(
    userId: string,
    organizationId: string,
    requesterId: string
): Promise<{ email: string }> {
    // Không cho tự xoá bản thân
    if (userId === requesterId) {
        throw new AppError(400, 'Không thể tự xoá tài khoản của mình');
    }

    const target = await queryOne<{ id: string; role: string; email: string }>(
        `SELECT id, role, email FROM users WHERE id = $1 AND "organizationId" = $2`,
        [userId, organizationId]
    );
    if (!target) throw new AppError(404, 'User không tồn tại');

    if (target.role === 'SUPER_ADMIN') {
        throw new AppError(403, 'Không thể xoá tài khoản SUPER_ADMIN');
    }

    // Soft delete: đổi status thành INACTIVE thay vì xoá thật
    await query(
        `UPDATE users SET status = 'INACTIVE', "updatedAt" = NOW()
         WHERE id = $1 AND "organizationId" = $2`,
        [userId, organizationId]
    );

    logger.info('User deleted (soft)', { requesterId, targetUserId: userId });
    return { email: target.email };
}

// ─── Hard delete user ──────────────────────────────────────────────────────────

export async function hardDeleteUser(
    userId: string,
    organizationId: string,
    requesterId: string
): Promise<{ email: string }> {
    if (userId === requesterId) {
        throw new AppError(400, 'Không thể tự xoá tài khoản của mình');
    }

    const target = await queryOne<{ id: string; role: string; email: string }>(
        `SELECT id, role, email FROM users WHERE id = $1 AND "organizationId" = $2`,
        [userId, organizationId]
    );
    if (!target) throw new AppError(404, 'User không tồn tại');

    if (target.role === 'SUPER_ADMIN') {
        throw new AppError(403, 'Không thể xoá tài khoản SUPER_ADMIN');
    }

    await query(`DELETE FROM users WHERE id = $1 AND "organizationId" = $2`, [userId, organizationId]);

    logger.info('User hard deleted', { requesterId, targetUserId: userId });
    return { email: target.email };
}
