import { z } from 'zod';

// Roles khớp với DB ENUM
export const USER_ROLES = ['ADMIN', 'MANAGER', 'VIEWER', 'CONTENT_MANAGER', 'SITE_MANAGER'] as const;
export const USER_STATUSES = ['ACTIVE', 'INACTIVE'] as const;

/**
 * Schema tạo user mới
 * POST /api/users
 */
export const createUserSchema = z.object({
    body: z.object({
        email: z.string().email('Email không hợp lệ'),
        password: z
            .string()
            .min(8, 'Mật khẩu tối thiểu 8 ký tự')
            .regex(/[0-9]/, 'Mật khẩu phải chứa ít nhất 1 số')
            .regex(/[^a-zA-Z0-9]/, 'Mật khẩu phải chứa ít nhất 1 ký tự đặc biệt'),
        role: z.enum(USER_ROLES).default('VIEWER'),
        siteId: z.string().uuid().optional().nullable(),
    }).refine(
        (data) => data.role !== 'SITE_MANAGER' || !!data.siteId,
        { message: 'SITE_MANAGER phải được gán vào một site', path: ['siteId'] }
    ),
});

/**
 * Schema cập nhật user
 * PUT /api/users/:id
 */
export const updateUserSchema = z.object({
    params: z.object({ id: z.string().min(1) }),
    body: z.object({
        role: z.enum(USER_ROLES).optional(),
        status: z.enum(USER_STATUSES).optional(),
        email: z.string().email().optional(),
        password: z.string().min(6).optional(),
        siteId: z.string().uuid().optional().nullable(),
    }).refine(
        (data) => Object.keys(data).length > 0,
        { message: 'Phải cung cấp ít nhất một trường để cập nhật' }
    ),
});

/**
 * Schema query params cho list users
 * GET /api/users
 */
export const listUsersSchema = z.object({
    query: z.object({
        page: z.coerce.number().int().min(1).catch(1),
        limit: z.coerce.number().int().min(1).max(100).catch(20),
        role: z.enum(USER_ROLES).optional().catch(undefined),
        status: z.enum(USER_STATUSES).optional().catch(undefined),
        search: z.string().optional(),
    }),
});

export type CreateUserBody = z.infer<typeof createUserSchema>['body'];
export type UpdateUserBody = z.infer<typeof updateUserSchema>['body'];
export type ListUsersQuery = z.infer<typeof listUsersSchema>['query'];
