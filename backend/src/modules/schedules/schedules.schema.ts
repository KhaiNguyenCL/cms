import { z } from 'zod';

export const SCHEDULE_TARGETS = ['ALL', 'DEVICE', 'GROUP'] as const;

// ─── List ─────────────────────────────────────────────────────────────────────

export const listSchedulesSchema = z.object({
    query: z.object({
        page: z.coerce.number().int().min(1).catch(1),
        limit: z.coerce.number().int().min(1).max(100).catch(20),
        search: z.string().optional(),
        isActive: z.enum(['true', 'false']).optional().catch(undefined),
        targetType: z.enum(SCHEDULE_TARGETS).optional().catch(undefined),
    }),
});

// ─── Create ───────────────────────────────────────────────────────────────────

export const createScheduleSchema = z.object({
    body: z.object({
        name: z.string().min(1).max(200),
        playlistId: z.string().min(1),
        targetType: z.enum(SCHEDULE_TARGETS).default('ALL'),
        targetDeviceId: z.string().optional().nullable(),
        targetGroupId: z.string().optional().nullable(),
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format: YYYY-MM-DD'),
        endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format: YYYY-MM-DD').optional().nullable(),
        startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Format: HH:MM').optional().nullable(),
        endTime: z.string().regex(/^\d{2}:\d{2}$/, 'Format: HH:MM').optional().nullable(),
        // 0=Sun, 1=Mon, …, 6=Sat — empty means everyday
        daysOfWeek: z.array(z.number().int().min(0).max(6)).optional().default([]),
        priority: z.number().int().min(0).max(100).optional().default(0),
        isActive: z.boolean().optional().default(true),
    }).superRefine((d, ctx) => {
        if (d.targetType === 'DEVICE' && !d.targetDeviceId) {
            ctx.addIssue({ code: 'custom', path: ['targetDeviceId'], message: 'targetDeviceId bắt buộc khi targetType=DEVICE' });
        }
        if (d.targetType === 'GROUP' && !d.targetGroupId) {
            ctx.addIssue({ code: 'custom', path: ['targetGroupId'], message: 'targetGroupId bắt buộc khi targetType=GROUP' });
        }
    }),
});

// ─── Update ───────────────────────────────────────────────────────────────────

export const updateScheduleSchema = z.object({
    params: z.object({ id: z.string().min(1) }),
    body: z.object({
        name: z.string().min(1).max(200).optional(),
        playlistId: z.string().optional(),
        targetType: z.enum(SCHEDULE_TARGETS).optional(),
        targetDeviceId: z.string().optional().nullable(),
        targetGroupId: z.string().optional().nullable(),
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
        startTime: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
        endTime: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
        daysOfWeek: z.array(z.number().int().min(0).max(6)).optional(),
        priority: z.number().int().min(0).max(100).optional(),
        isActive: z.boolean().optional(),
    }).refine(d => Object.keys(d).length > 0, { message: 'Phải cung cấp ít nhất một trường' }),
});

export type ListSchedulesQuery = z.infer<typeof listSchedulesSchema>['query'];
export type CreateScheduleBody = z.infer<typeof createScheduleSchema>['body'];
export type UpdateScheduleBody = z.infer<typeof updateScheduleSchema>['body'];
