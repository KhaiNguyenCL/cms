import { z } from 'zod';

export const createBackupSchema = z.object({
    body: z.object({
        label: z.string().min(1).max(100).optional(),
    }),
});

export const requestPlanSchema = z.object({
    body: z.object({
        requestedPlan: z.number().refine(v => [3, 7, 10].includes(v), {
            message: 'Chỉ hỗ trợ gói 3, 7, hoặc 10 ngày',
        }),
        note: z.string().max(500).optional(),
    }),
});

export const resolvePlanSchema = z.object({
    body: z.object({
        adminNote: z.string().max(500).optional(),
    }),
});

export type CreateBackupBody = z.infer<typeof createBackupSchema>['body'];
export type RequestPlanBody  = z.infer<typeof requestPlanSchema>['body'];
export type ResolvePlanBody  = z.infer<typeof resolvePlanSchema>['body'];
