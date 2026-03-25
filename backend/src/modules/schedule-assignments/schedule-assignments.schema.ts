import { z } from 'zod';

const targetSchema = z.object({
    targetType: z.enum(['DEVICE', 'SITE']),
    targetId: z.string().min(1),
});

export const bulkAssignSchema = z.object({
    scheduleId: z.string().min(1),
    targets: z.array(targetSchema).min(1),
});

export const bulkUnassignSchema = z.object({
    ids: z.array(z.string()).min(1),
});

export const reorderSchema = z.object({
    targetType: z.enum(['DEVICE', 'SITE']),
    targetId: z.string().min(1),
    orderedIds: z.array(z.string()).min(1),
});

export type BulkAssignBody   = z.infer<typeof bulkAssignSchema>;
export type BulkUnassignBody = z.infer<typeof bulkUnassignSchema>;
export type ReorderBody      = z.infer<typeof reorderSchema>;
