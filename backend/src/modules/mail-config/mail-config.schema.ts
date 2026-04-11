import { z } from 'zod';

export const createMailConfigSchema = z.object({
    body: z.object({
        name:        z.string().min(1).max(100),
        host:        z.string().min(1).max(255),
        port:        z.number().int().min(1).max(65535),
        secure:      z.boolean(),
        username:    z.string().min(1).max(255),
        password:    z.string().min(1).max(500),
        fromName:    z.string().min(1).max(100),
        fromAddress: z.string().email(),
    }),
});

export const updateMailConfigSchema = z.object({
    params: z.object({ id: z.string().min(1) }),
    body: z.object({
        name:        z.string().min(1).max(100).optional(),
        host:        z.string().min(1).max(255).optional(),
        port:        z.number().int().min(1).max(65535).optional(),
        secure:      z.boolean().optional(),
        username:    z.string().min(1).max(255).optional(),
        password:    z.string().min(1).max(500).optional(),
        fromName:    z.string().min(1).max(100).optional(),
        fromAddress: z.string().email().optional(),
    }),
});

export type CreateMailConfigBody = z.infer<typeof createMailConfigSchema>['body'];
export type UpdateMailConfigBody = z.infer<typeof updateMailConfigSchema>['body'];
