import { Request, Response, NextFunction } from 'express';
import * as devService from './devices.service';
import * as pairingService from './devices.pairing.service';
import { logAction } from '../action-history/action-history.service';
import {
    listDevicesSchema,
    registerDeviceSchema,
    generatePairingCodeSchema,
    devicePairSchema,
    reconnectDeviceSchema,
    refreshDeviceTokenSchema,
    batchGeneratePairingCodesSchema,
} from './devices.schema';

// ─── DEVICE PAIRING (3-STEP FLOW) ────────────────────────────────────────────

// POST /api/devices/register
// STEP 1: Admin registers device profile
export async function registerDevice(req: Request, res: Response, next: NextFunction) {
    try {
        const parsed = registerDeviceSchema.shape.body.parse(req.body);
        const result = await pairingService.registerDevice(
            req.user!.organizationId,
            req.user!.userId,
            parsed
        );
        res.status(201).json({
            success: true,
            message: 'Device được đăng ký thành công',
            data: result,
        });
    } catch (err) {
        next(err);
    }
}

// POST /api/devices/:deviceId/generate-pairing-code
// STEP 2: Admin generates pairing code
export async function generatePairingCode(req: Request, res: Response, next: NextFunction) {
    try {
        const { deviceId } = generatePairingCodeSchema.shape.params.parse(req.params);
        const result = await pairingService.generatePairingCode(
            deviceId,
            req.user!.organizationId,
            req.user!.userId,
            req.ip || '0.0.0.0'
        );
        res.json({
            success: true,
            message: 'Mã ghép cặp được tạo thành công',
            data: result,
        });
    } catch (err) {
        next(err);
    }
}

// POST /api/devices/pair
// STEP 3: Device pairs with signature verification
// No auth required - public endpoint for device
export async function pairDevice(req: Request, res: Response, next: NextFunction) {
    try {
        const parsed = devicePairSchema.shape.body.parse(req.body);
        const result = await pairingService.pairDevice(
            parsed,
            req.ip || '0.0.0.0'
        );
        res.json({
            success: true,
            message: 'Device ghép cặp thành công',
            data: result,
        });
    } catch (err) {
        next(err);
    }
}

// POST /api/devices/reconnect
// Device reconnects after reinstall using hwId (no pairing code needed)
// Returns 404 if device has never been paired → show pairing form
// No auth required - public endpoint for device
export async function reconnectDevice(req: Request, res: Response, next: NextFunction) {
    try {
        const parsed = reconnectDeviceSchema.shape.body.parse(req.body);
        const result = await pairingService.reconnectDevice(parsed, req.ip || '0.0.0.0');
        res.json({ success: true, message: 'Device kết nối lại thành công', data: result });
    } catch (err) {
        next(err);
    }
}

// POST /api/devices/refresh-token
// Device refreshes token before expiry
// Requires device auth
export async function refreshDeviceToken(req: Request, res: Response, next: NextFunction) {
    try {
        const result = await pairingService.refreshDeviceToken(
            req.user!.userId,
            req.user!.organizationId
        );
        res.json({
            success: true,
            message: 'Token được refresh thành công',
            data: result,
        });
    } catch (err) {
        next(err);
    }
}

// POST /api/devices/batch-generate-pairing-codes
// Batch generate pairing codes for multiple devices
export async function batchGeneratePairingCodes(req: Request, res: Response, next: NextFunction) {
    try {
        const parsed = batchGeneratePairingCodesSchema.shape.body.parse(req.body);
        const result = await pairingService.batchGeneratePairingCodes(
            req.user!.organizationId,
            req.user!.userId,
            req.ip || '0.0.0.0',
            parsed
        );
        res.json({
            success: true,
            message: 'Mã ghép cặp hàng loạt được tạo thành công',
            data: result,
        });
    } catch (err) {
        next(err);
    }
}

// GET /api/devices
export async function listDevices(req: Request, res: Response, next: NextFunction) {
    try {
        const parsed = listDevicesSchema.shape.query.parse(req.query);
        const siteFilter = req.user!.role === 'SITE_MANAGER' ? req.user!.siteId : null;
        const result = await devService.listDevices(req.user!.organizationId, parsed, siteFilter);
        res.json({ success: true, ...result });
    } catch (err) { next(err); }
}

// POST /api/devices
export async function createDevice(req: Request, res: Response, next: NextFunction) {
    try {
        const device = await devService.createDevice(req.user!.organizationId, req.body);
        logAction(req.user!.organizationId, req.user!.userId, 'CREATE', 'DEVICE', device.id, device.name).catch(() => {});
        res.status(201).json({ success: true, message: 'Device đã được tạo. Sàng lọc mã ghép cặp trên Android TV.', data: device });
    } catch (err) { next(err); }
}

// GET /api/devices/:id
export async function getDeviceById(req: Request, res: Response, next: NextFunction) {
    try {
        const siteFilter = req.user!.role === 'SITE_MANAGER' ? req.user!.siteId : null;
        const device = await devService.getDeviceById(req.params.id as string, req.user!.organizationId, siteFilter);
        res.json({ success: true, data: device });
    } catch (err) { next(err); }
}

// PUT /api/devices/:id
export async function updateDevice(req: Request, res: Response, next: NextFunction) {
    try {
        const siteFilter = req.user!.role === 'SITE_MANAGER' ? req.user!.siteId : null;
        const device = await devService.updateDevice(req.params.id as string, req.user!.organizationId, req.body, siteFilter);
        logAction(req.user!.organizationId, req.user!.userId, 'UPDATE', 'DEVICE', device.id, device.name).catch(() => {});
        res.json({ success: true, message: 'Cập nhật device thành công', data: device });
    } catch (err) { next(err); }
}

// DELETE /api/devices/:id  (soft delete → trash)
export async function deleteDevice(req: Request, res: Response, next: NextFunction) {
    try {
        const { name } = await devService.deleteDevice(req.params.id as string, req.user!.organizationId);
        logAction(req.user!.organizationId, req.user!.userId, 'DELETE', 'DEVICE', req.params.id as string, name).catch(() => {});
        res.json({ success: true, message: 'Device đã được chuyển vào thùng rác' });
    } catch (err) { next(err); }
}

// GET /api/devices/trash
export async function listTrashedDevices(req: Request, res: Response, next: NextFunction) {
    try {
        const devices = await devService.listTrashedDevices(req.user!.organizationId);
        res.json({ success: true, data: devices });
    } catch (err) { next(err); }
}

// POST /api/devices/:id/restore
export async function restoreDevice(req: Request, res: Response, next: NextFunction) {
    try {
        const { name } = await devService.restoreDevice(req.params.id as string, req.user!.organizationId);
        logAction(req.user!.organizationId, req.user!.userId, 'UPDATE', 'DEVICE', req.params.id as string, name).catch(() => {});
        res.json({ success: true, message: 'Device đã được khôi phục' });
    } catch (err) { next(err); }
}

// DELETE /api/devices/:id/permanent
export async function permanentDeleteDevice(req: Request, res: Response, next: NextFunction) {
    try {
        const { name } = await devService.permanentDeleteDevice(req.params.id as string, req.user!.organizationId);
        logAction(req.user!.organizationId, req.user!.userId, 'DELETE', 'DEVICE', req.params.id as string, name).catch(() => {});
        res.json({ success: true, message: 'Device đã bị xoá vĩnh viễn' });
    } catch (err) { next(err); }
}

// POST /api/devices/:id/reset
export async function resetDevice(req: Request, res: Response, next: NextFunction) {
    try {
        const result = await devService.resetDevice(req.params.id as string, req.user!.organizationId);
        res.json({ success: true, message: 'Device đã được reset — cần ghép cặp lại', data: result });
    } catch (err) { next(err); }
}

// POST /api/devices/:id/command
export async function sendCommand(req: Request, res: Response, next: NextFunction) {
    try {
        const siteFilter = req.user!.role === 'SITE_MANAGER' ? req.user!.siteId : null;
        const result = await devService.sendDeviceCommand(req.params.id as string, req.user!.organizationId, req.body, siteFilter);
        res.json({ success: true, data: result });
    } catch (err) { next(err); }
}

// GET /api/devices/:id/screenshot
export async function getScreenshot(req: Request, res: Response, next: NextFunction) {
    try {
        const siteFilter = req.user!.role === 'SITE_MANAGER' ? req.user!.siteId : null;
        const result = await devService.sendDeviceCommand(req.params.id as string, req.user!.organizationId, { command: 'SCREENSHOT' }, siteFilter);
        res.json({ success: true, message: 'Screenshot command queued', data: result });
    } catch (err) { next(err); }
}

// GET /api/devices/:id/logs
export async function getDeviceLogs(req: Request, res: Response, next: NextFunction) {
    try {
        const result = await devService.getDeviceLogs(req.params.id as string, req.user!.organizationId);
        res.json({ success: true, data: result });
    } catch (err) { next(err); }
}

// GET /api/devices/:id/health
export async function getDeviceHealth(req: Request, res: Response, next: NextFunction) {
    try {
        const health = await devService.getDeviceHealth(req.params.id as string, req.user!.organizationId);
        res.json({ success: true, data: health });
    } catch (err) { next(err); }
}


// PATCH /api/devices/:id/license
export async function setDeviceLicense(req: Request, res: Response, next: NextFunction) {
    try {
        const { isLicensed } = req.body as { isLicensed: boolean };
        const device = await devService.setDeviceLicense(req.params.id as string, req.user!.organizationId, isLicensed);
        res.json({ success: true, message: `Device license ${isLicensed ? 'enabled' : 'disabled'}`, data: device });
    } catch (err) { next(err); }
}

// GET /api/devices/:id/now-playing
export async function getNowPlaying(req: Request, res: Response, next: NextFunction) {
    try {
        const result = await devService.getNowPlaying(req.params.id as string, req.user!.organizationId);
        res.json({ success: true, data: result });
    } catch (err) { next(err); }
}

// GET /api/devices/:id/active-schedules
export async function getActiveSchedules(req: Request, res: Response, next: NextFunction) {
    try {
        const { getActiveSchedulesForDevice } = await import('../schedules/schedules.service');
        const result = await getActiveSchedulesForDevice(req.params.id as string, req.user!.organizationId);
        res.json({ success: true, data: result });
    } catch (err) { next(err); }
}

// GET /api/devices/:id/comments
export async function getDeviceComments(req: Request, res: Response, next: NextFunction) {
    try {
        const result = await devService.getDeviceComments(req.params.id as string, req.user!.organizationId);
        res.json({ success: true, data: result });
    } catch (err) { next(err); }
}

// POST /api/devices/:id/comments
export async function addDeviceComment(req: Request, res: Response, next: NextFunction) {
    try {
        const { comment, userName } = req.body as { comment: string; userName?: string };
        if (!comment || !comment.trim()) {
            res.status(400).json({ success: false, message: 'Ghi chú không được để trống' });
            return;
        }
        // SITE_MANAGER: verify device belongs to their site before inserting
        if (req.user!.role === 'SITE_MANAGER') {
            await devService.getDeviceById(req.params.id as string, req.user!.organizationId, req.user!.siteId);
        }
        const result = await devService.addDeviceComment(
            req.params.id as string,
            req.user!.organizationId,
            req.user!.userId,
            userName ?? req.user!.userId,
            comment.trim()
        );
        res.status(201).json({ success: true, data: result });
    } catch (err) { next(err); }
}

// ─── Device Groups ─────────────────────────────────────────────────────────────

// GET /api/device-groups
export async function listGroups(req: Request, res: Response, next: NextFunction) {
    try {
        const groups = await devService.listGroups(req.user!.organizationId);
        res.json({ success: true, data: groups });
    } catch (err) { next(err); }
}

// POST /api/device-groups
export async function createGroup(req: Request, res: Response, next: NextFunction) {
    try {
        const group = await devService.createGroup(req.user!.organizationId, req.body);
        res.status(201).json({ success: true, message: 'Tạo group thành công', data: group });
    } catch (err) { next(err); }
}

// PUT /api/device-groups/:id
export async function updateGroup(req: Request, res: Response, next: NextFunction) {
    try {
        const group = await devService.updateGroup(req.params.id as string, req.user!.organizationId, req.body);
        res.json({ success: true, message: 'Cập nhật group thành công', data: group });
    } catch (err) { next(err); }
}

