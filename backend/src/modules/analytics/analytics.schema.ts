import { z } from 'zod';

// ─── Date range helper used across analytics queries ──────────────────────────

const dateRange = {
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format: YYYY-MM-DD').optional(),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format: YYYY-MM-DD').optional(),
};

// ─── Dashboard overview (no params needed) ────────────────────────────────────

export const overviewSchema = z.object({
    query: z.object({
        from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    }),
});

// ─── Playback analytics ───────────────────────────────────────────────────────

export const playbackStatsSchema = z.object({
    query: z.object({
        ...dateRange,
        deviceId: z.string().optional(),
        mediaId: z.string().optional(),
        groupBy: z.enum(['day', 'week', 'month']).optional().catch('day'),
    }),
});

// ─── Device health ────────────────────────────────────────────────────────────

export const deviceHealthSchema = z.object({
    query: z.object({
        deviceId: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(500).catch(50),
    }),
});

// ─── Top content ──────────────────────────────────────────────────────────────

export const topContentSchema = z.object({
    query: z.object({
        ...dateRange,
        limit: z.coerce.number().int().min(1).max(50).catch(10),
    }),
});

export type OverviewQuery = z.infer<typeof overviewSchema>['query'];
export type PlaybackStatsQuery = z.infer<typeof playbackStatsSchema>['query'];
export type DeviceHealthQuery = z.infer<typeof deviceHealthSchema>['query'];
export type TopContentQuery = z.infer<typeof topContentSchema>['query'];
