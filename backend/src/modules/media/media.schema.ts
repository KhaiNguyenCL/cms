import { z } from 'zod';

export const MEDIA_TYPES = ['IMAGE', 'GIF', 'VIDEO', 'HTML', 'URL'] as const;
export const MEDIA_STATUSES = ['PROCESSING', 'READY', 'ERROR'] as const;

// ─── List / filter ────────────────────────────────────────────────────────────

export const listMediaSchema = z.object({
    query: z.object({
        page: z.coerce.number().int().min(1).catch(1),
        limit: z.coerce.number().int().min(1).max(500).catch(20),
        type: z.enum(MEDIA_TYPES).optional().catch(undefined),
        status: z.enum(MEDIA_STATUSES).optional().catch(undefined),
        search: z.string().optional(),
    }),
});

// ─── Update metadata ──────────────────────────────────────────────────────────

export const updateMediaSchema = z.object({
    params: z.object({ id: z.string().min(1) }),
    body: z.object({
        title: z.string().min(1).max(200).optional(),
        description: z.string().max(1000).optional().nullable(),
        tags: z.array(z.string()).optional(),
    }).refine(d => Object.keys(d).length > 0, { message: 'Phải cung cấp ít nhất một trường' }),
});

export type ListMediaQuery = z.infer<typeof listMediaSchema>['query'];
export type UpdateMediaBody = z.infer<typeof updateMediaSchema>['body'];
