import { Request, Response, NextFunction } from 'express';
import * as analyticsService from './analytics.service';
import { overviewSchema, playbackStatsSchema, deviceHealthSchema, topContentSchema } from './analytics.schema';

// GET /api/analytics/overview
export async function getOverview(req: Request, res: Response, next: NextFunction) {
    try {
        const q = overviewSchema.shape.query.parse(req.query);
        const data = await analyticsService.getDashboardOverview(req.user!.organizationId, q);
        res.json({ success: true, data });
    } catch (err) { next(err); }
}

// GET /api/analytics/playback
export async function getPlayback(req: Request, res: Response, next: NextFunction) {
    try {
        const q = playbackStatsSchema.shape.query.parse(req.query);
        const data = await analyticsService.getPlaybackStats(req.user!.organizationId, q);
        res.json({ success: true, data });
    } catch (err) { next(err); }
}

// GET /api/analytics/top-content
export async function getTopContent(req: Request, res: Response, next: NextFunction) {
    try {
        const q = topContentSchema.shape.query.parse(req.query);
        const data = await analyticsService.getTopContent(req.user!.organizationId, q);
        res.json({ success: true, data });
    } catch (err) { next(err); }
}

// GET /api/analytics/device-health
export async function getDeviceHealth(req: Request, res: Response, next: NextFunction) {
    try {
        const q = deviceHealthSchema.shape.query.parse(req.query);
        const data = await analyticsService.getDeviceHealth(req.user!.organizationId, q);
        res.json({ success: true, data });
    } catch (err) { next(err); }
}

// GET /api/analytics/device-charts
export async function getDeviceCharts(req: Request, res: Response, next: NextFunction) {
    try {
        const data = await analyticsService.getDeviceCharts(req.user!.organizationId);
        res.json({ success: true, data });
    } catch (err) { next(err); }
}

// GET /api/analytics/top-playlists
export async function getTopPlaylists(req: Request, res: Response, next: NextFunction) {
    try {
        const from  = req.query.from  as string | undefined;
        const to    = req.query.to    as string | undefined;
        const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
        const data  = await analyticsService.getTopPlaylists(req.user!.organizationId, { from, to, limit });
        res.json({ success: true, data });
    } catch (err) { next(err); }
}

// GET /api/analytics/top-schedules
export async function getTopSchedules(req: Request, res: Response, next: NextFunction) {
    try {
        const from  = req.query.from  as string | undefined;
        const to    = req.query.to    as string | undefined;
        const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
        const data  = await analyticsService.getTopSchedules(req.user!.organizationId, { from, to, limit });
        res.json({ success: true, data });
    } catch (err) { next(err); }
}

// GET /api/analytics/creation-stats
export async function getCreationStats(req: Request, res: Response, next: NextFunction) {
    try {
        const from    = req.query.startDate as string | undefined;
        const to      = req.query.endDate   as string | undefined;
        const groupBy = (req.query.groupBy as 'day' | 'week' | 'month' | undefined) ?? 'day';
        const data    = await analyticsService.getCreationStats(req.user!.organizationId, { from, to, groupBy });
        res.json({ success: true, data });
    } catch (err) { next(err); }
}

// GET /api/analytics/device-activity
export async function getDeviceActivity(req: Request, res: Response, next: NextFunction) {
    try {
        const from = req.query.from as string | undefined;
        const to = req.query.to as string | undefined;
        const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;
        const data = await analyticsService.getDeviceActivity(req.user!.organizationId, { from, to, limit });
        res.json({ success: true, data });
    } catch (err) { next(err); }
}
