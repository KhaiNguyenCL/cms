import { Request, Response, NextFunction } from 'express';
import * as deviceSyncService from './device-sync.service';

// POST /api/device/register
// Public — no auth needed (uses pairingCode for identity)
export async function registerDevice(req: Request, res: Response, next: NextFunction) {
    try {
        const result = await deviceSyncService.registerDevice(req.body);
        res.status(200).json({
            success: true,
            message: 'Thiết bị đã được đăng ký thành công',
            data: result,
        });
    } catch (err) { next(err); }
}

// POST /api/device/heartbeat
// Requires device JWT
export async function heartbeat(req: Request, res: Response, next: NextFunction) {
    try {
        const deviceId = req.user!.userId;       // userId slot holds deviceId
        const organizationId = req.user!.organizationId;
        const result = await deviceSyncService.heartbeat(deviceId, organizationId, req.body);
        res.json({ success: true, data: result });
    } catch (err) { next(err); }
}

// GET /api/device/sync
// Requires device JWT — returns full schedule+playlist+media payload
export async function syncContent(req: Request, res: Response, next: NextFunction) {
    try {
        const deviceId = req.user!.userId;
        const organizationId = req.user!.organizationId;
        const result = await deviceSyncService.getDeviceSync(deviceId, organizationId);
        res.json({ success: true, data: result });
    } catch (err) { next(err); }
}

// POST /api/device/playback-log
// Log a single media playback event
export async function logPlayback(req: Request, res: Response, next: NextFunction) {
    try {
        const deviceId = req.user!.userId;
        const organizationId = req.user!.organizationId;
        const result = await deviceSyncService.logPlayback(deviceId, organizationId, req.body);
        res.status(201).json({ success: true, data: result });
    } catch (err) { next(err); }
}

// POST /api/device/playback-logs/batch
// Upload many offline logs at once
export async function batchLogPlayback(req: Request, res: Response, next: NextFunction) {
    try {
        const deviceId = req.user!.userId;
        const organizationId = req.user!.organizationId;
        const result = await deviceSyncService.batchLogPlayback(deviceId, organizationId, req.body);
        res.status(201).json({ success: true, data: result });
    } catch (err) { next(err); }
}

// POST /api/device/offline
// Device calls on clean shutdown to update status
export async function markOffline(req: Request, res: Response, next: NextFunction) {
    try {
        await deviceSyncService.markDeviceOffline(req.user!.userId, req.user!.organizationId);
        res.json({ success: true, message: 'Trạng thái offline đã được cập nhật' });
    } catch (err) { next(err); }
}
