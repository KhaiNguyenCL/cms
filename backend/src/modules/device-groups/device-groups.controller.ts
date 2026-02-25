import type { Request, Response, NextFunction } from 'express';
import * as groupService from './device-groups.service';

// ─── List groups ──────────────────────────────────────────────────────────────

export async function listGroups(req: Request, res: Response, next: NextFunction) {
    try {
        const result = await groupService.listGroups(req.user!.organizationId, req.query as any);
        res.json({ success: true, ...result });
    } catch (err) { next(err); }
}

// ─── Get group ────────────────────────────────────────────────────────────────

export async function getGroup(req: Request, res: Response, next: NextFunction) {
    try {
        const group = await groupService.getGroupById(String(req.params.id), req.user!.organizationId);
        res.json({ success: true, data: group });
    } catch (err) { next(err); }
}

// ─── Create group ─────────────────────────────────────────────────────────────

export async function createGroup(req: Request, res: Response, next: NextFunction) {
    try {
        const group = await groupService.createGroup(req.user!.organizationId, req.body);
        res.status(201).json({ success: true, data: group });
    } catch (err) { next(err); }
}

// ─── Update group ─────────────────────────────────────────────────────────────

export async function updateGroup(req: Request, res: Response, next: NextFunction) {
    try {
        const group = await groupService.updateGroup(String(req.params.id), req.user!.organizationId, req.body);
        res.json({ success: true, data: group });
    } catch (err) { next(err); }
}

// ─── Delete group ─────────────────────────────────────────────────────────────

export async function deleteGroup(req: Request, res: Response, next: NextFunction) {
    try {
        await groupService.deleteGroup(String(req.params.id), req.user!.organizationId);
        res.json({ success: true, message: 'Device group đã được xóa' });
    } catch (err) { next(err); }
}

// ─── Add device to group ──────────────────────────────────────────────────────

export async function addDevice(req: Request, res: Response, next: NextFunction) {
    try {
        await groupService.addDeviceToGroup(String(req.params.id), req.body.deviceId, req.user!.organizationId);
        res.status(201).json({ success: true, message: 'Device đã được thêm vào group' });
    } catch (err) { next(err); }
}

// ─── Remove device from group ─────────────────────────────────────────────────

export async function removeDevice(req: Request, res: Response, next: NextFunction) {
    try {
        await groupService.removeDeviceFromGroup(String(req.params.id), String(req.params.deviceId), req.user!.organizationId);
        res.json({ success: true, message: 'Device đã được xóa khỏi group' });
    } catch (err) { next(err); }
}
