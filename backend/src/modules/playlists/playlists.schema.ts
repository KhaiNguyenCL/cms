import { z } from 'zod';

// ─── Playlist CRUD ────────────────────────────────────────────────────────────

export const listPlaylistsSchema = z.object({
    query: z.object({
        page: z.coerce.number().int().min(1).catch(1),
        limit: z.coerce.number().int().min(1).max(500).catch(20),
        search: z.string().optional(),
    }),
});

export const createPlaylistSchema = z.object({
    body: z.object({
        name: z.string().min(1).max(200),
        description: z.string().max(1000).optional().nullable(),
        isDefault: z.boolean().optional().default(false),
    }),
});

export const updatePlaylistSchema = z.object({
    params: z.object({ id: z.string().min(1) }),
    body: z.object({
        name: z.string().min(1).max(200).optional(),
        description: z.string().max(1000).optional().nullable(),
        isDefault: z.boolean().optional(),
    }).refine(d => Object.keys(d).length > 0, { message: 'Phải cung cấp ít nhất một trường' }),
});

// ─── Playlist Items ───────────────────────────────────────────────────────────

export const addItemSchema = z.object({
    params: z.object({ id: z.string().min(1) }),
    body: z.object({
        mediaId: z.string().min(1),
        durationOverride: z.number().int().min(1).max(86400).optional().nullable(),
        transition: z.string().max(50).optional().nullable(),
        transitionDuration: z.number().int().min(100).max(5000).optional().nullable(),
    }),
});

export const updateItemSchema = z.object({
    params: z.object({ id: z.string().min(1), itemId: z.string().min(1) }),
    body: z.object({
        durationOverride: z.number().int().min(1).max(86400).optional().nullable(),
        transition: z.string().max(50).optional().nullable(),
        transitionDuration: z.number().int().min(100).max(5000).optional().nullable(),
    }).refine(d => Object.keys(d).length > 0, { message: 'Phải cung cấp ít nhất một trường' }),
});

// ─── Reorder: batch update positions ─────────────────────────────────────────

export const reorderItemsSchema = z.object({
    params: z.object({ id: z.string().min(1) }),
    body: z.object({
        // Array of { itemId, position } — client sends new ordering
        items: z.array(z.object({
            itemId: z.string().min(1),
            position: z.number().int().min(0),
        })).min(1),
    }),
});

export type ListPlaylistsQuery = z.infer<typeof listPlaylistsSchema>['query'];
export type CreatePlaylistBody = z.infer<typeof createPlaylistSchema>['body'];
export type UpdatePlaylistBody = z.infer<typeof updatePlaylistSchema>['body'];
export type AddItemBody = z.infer<typeof addItemSchema>['body'];
export type UpdateItemBody = z.infer<typeof updateItemSchema>['body'];
export type ReorderItemsBody = z.infer<typeof reorderItemsSchema>['body'];
