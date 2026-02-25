import { z } from 'zod';

// ─── List ─────────────────────────────────────────────────────────────────────

export const listGroupsSchema = z.object({
    query: z.object({
        page: z.coerce.number().int().min(1).catch(1),
        limit: z.coerce.number().int().min(1).max(100).catch(20),
        search: z.string().optional(),
    }),
});

// ─── Create ───────────────────────────────────────────────────────────────────

export const createGroupSchema = z.object({
    body: z.object({
        name: z.string().min(1).max(200),
        description: z.string().max(500).optional().nullable(),
    }),
});

// ─── Update ───────────────────────────────────────────────────────────────────

export const updateGroupSchema = z.object({
    params: z.object({ id: z.string().min(1) }),
    body: z.object({
        name: z.string().min(1).max(200).optional(),
        description: z.string().max(500).optional().nullable(),
    }).refine(d => Object.keys(d).length > 0, { message: 'Phải cung cấp ít nhất một trường' }),
});

// ─── Add/Remove device ────────────────────────────────────────────────────────

export const groupDeviceSchema = z.object({
    params: z.object({ id: z.string().min(1) }),
    body: z.object({
        deviceId: z.string().min(1),
    }),
});

export type ListGroupsQuery = z.infer<typeof listGroupsSchema>['query'];
export type CreateGroupBody = z.infer<typeof createGroupSchema>['body'];
export type UpdateGroupBody = z.infer<typeof updateGroupSchema>['body'];
export type GroupDeviceBody = z.infer<typeof groupDeviceSchema>['body'];
