import { z } from 'zod';

export const createTemplateSchema = z.object({
    body: z.object({
        name:        z.string().min(1).max(100),
        subject:     z.string().min(1).max(500),
        bodyHtml:    z.string().min(1),
        description: z.string().max(500).optional(),
    }),
});

export const updateTemplateSchema = z.object({
    params: z.object({ id: z.string().min(1) }),
    body: z.object({
        name:        z.string().min(1).max(100).optional(),
        subject:     z.string().min(1).max(500).optional(),
        bodyHtml:    z.string().min(1).optional(),
        description: z.string().max(500).optional(),
    }),
});

export type CreateTemplateBody = z.infer<typeof createTemplateSchema>['body'];
export type UpdateTemplateBody = z.infer<typeof updateTemplateSchema>['body'];
