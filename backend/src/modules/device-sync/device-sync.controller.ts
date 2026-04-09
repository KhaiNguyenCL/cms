import { Request, Response, NextFunction } from 'express';
import * as deviceSyncService from './device-sync.service';

// GET /api/device/my-ip — device calls this to discover its own WAN IP
// Requires device JWT; Express trust proxy ensures req.ip = real client IP via nginx X-Forwarded-For
export async function getMyIp(req: Request, res: Response) {
    const ip = req.ip?.replace(/^::ffff:/, '') ?? null;
    res.json({ success: true, data: { ip } });
}

// GET /api/device/browser-token?deviceId=xxx
// Public — for Tizen / browser players that cannot use NativeBridge
export async function getBrowserToken(req: Request, res: Response, next: NextFunction) {
    try {
        const deviceId = String(req.query.deviceId ?? '');
        if (!deviceId) throw { status: 400, message: 'deviceId required' };
        const result = await deviceSyncService.getBrowserToken(deviceId);
        res.json({ success: true, data: result });
    } catch (err) { next(err); }
}

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
        // Prefer wanIp sent by device (fetched from ipify.org); fall back to req.ip (unreliable on LAN)
        const bodyWanIp = req.body?.wanIp ?? null;
        const rawIp = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ?? req.ip ?? null;
        const fallbackIp = rawIp?.replace(/^::ffff:/, '') ?? null;
        const wanIp = bodyWanIp ?? fallbackIp;
        const result = await deviceSyncService.heartbeat(deviceId, organizationId, req.body, wanIp);
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

// POST /api/device/playlist-log
// Log 1 vòng playlist hoàn thành hoặc bị gián đoạn
export async function logPlaylistSession(req: Request, res: Response, next: NextFunction) {
    try {
        const deviceId = req.user!.userId;
        await deviceSyncService.logPlaylistSession(deviceId, req.body);
        res.status(201).json({ success: true });
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

// GET /api/device/content-manifest
// Device calls on boot or on content.update to get list of files to download
export async function getContentManifest(req: Request, res: Response, next: NextFunction) {
    try {
        const deviceId = req.user!.userId;
        const organizationId = req.user!.organizationId;
        const manifest = await deviceSyncService.getContentManifest(deviceId, organizationId);
        res.json({ success: true, data: manifest });
    } catch (err) { next(err); }
}

// POST /api/device/offline
// Device calls on clean shutdown to update status
export async function markOffline(req: Request, res: Response, next: NextFunction) {
    try {
        await deviceSyncService.markDeviceOffline(req.user!.userId, req.user!.organizationId, 'APP_EXIT');
        res.json({ success: true, message: 'Trạng thái offline đã được cập nhật' });
    } catch (err) { next(err); }
}
