import { Request, Response, NextFunction } from 'express';
import * as devService from './devices.service';
import * as pairingService from './devices.pairing.service';
import {
    listDevicesSchema,
    registerDeviceSchema,
    generatePairingCodeSchema,
    devicePairSchema,
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
        const result = await devService.listDevices(req.user!.organizationId, parsed);
        res.json({ success: true, ...result });
    } catch (err) { next(err); }
}

// POST /api/devices
export async function createDevice(req: Request, res: Response, next: NextFunction) {
    try {
        const device = await devService.createDevice(req.user!.organizationId, req.body);
        res.status(201).json({ success: true, message: 'Device đã được tạo. Sàng lọc mã ghép cặp trên Android TV.', data: device });
    } catch (err) { next(err); }
}

// GET /api/devices/:id
export async function getDeviceById(req: Request, res: Response, next: NextFunction) {
    try {
        const device = await devService.getDeviceById(req.params.id as string, req.user!.organizationId);
        res.json({ success: true, data: device });
    } catch (err) { next(err); }
}

// PUT /api/devices/:id
export async function updateDevice(req: Request, res: Response, next: NextFunction) {
    try {
        const device = await devService.updateDevice(req.params.id as string, req.user!.organizationId, req.body);
        res.json({ success: true, message: 'Cập nhật device thành công', data: device });
    } catch (err) { next(err); }
}

// DELETE /api/devices/:id
export async function deleteDevice(req: Request, res: Response, next: NextFunction) {
    try {
        await devService.deleteDevice(req.params.id as string, req.user!.organizationId);
        res.json({ success: true, message: 'Device đã được xoá' });
    } catch (err) { next(err); }
}

// POST /api/devices/:id/command
export async function sendCommand(req: Request, res: Response, next: NextFunction) {
    try {
        const result = await devService.sendDeviceCommand(req.params.id as string, req.user!.organizationId, req.body);
        res.json({ success: true, data: result });
    } catch (err) { next(err); }
}

// GET /api/devices/:id/screenshot
export async function getScreenshot(req: Request, res: Response, next: NextFunction) {
    try {
        // Screenshot được device tự push lên server, không pull trực tiếp
        // Trigger SCREENSHOT command và return placeholder
        const result = await devService.sendDeviceCommand(req.params.id as string, req.user!.organizationId, { command: 'SCREENSHOT' });
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
