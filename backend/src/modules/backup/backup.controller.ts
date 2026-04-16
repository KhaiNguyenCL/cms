import { Request, Response, NextFunction } from 'express';
import * as service from './backup.service';
import { createBackupSchema, requestPlanSchema, resolvePlanSchema } from './backup.schema';

export async function list(req: Request, res: Response, next: NextFunction) {
    try {
        const orgId = req.user!.organizationId;
        const rows = await service.listBackups(orgId);
        res.json({ success: true, data: rows });
    } catch (err) { next(err); }
}

export async function create(req: Request, res: Response, next: NextFunction) {
    try {
        const orgId = req.user!.organizationId;
        const userId = req.user!.userId;
        const { label } = createBackupSchema.shape.body.parse(req.body);
        const row = await service.createBackup(orgId, userId, label, 'MANUAL');
        res.status(201).json({ success: true, data: row });
    } catch (err) { next(err); }
}

export async function remove(req: Request, res: Response, next: NextFunction) {
    try {
        const orgId = req.user!.organizationId;
        await service.deleteBackup(orgId, String(req.params.id));
        res.json({ success: true });
    } catch (err) { next(err); }
}

export async function restore(req: Request, res: Response, next: NextFunction) {
    try {
        const orgId = req.user!.organizationId;
        const requesterId = req.user!.userId;
        await service.restoreBackup(orgId, String(req.params.id), requesterId);
        res.json({ success: true, message: 'Restore completed. All devices will re-sync shortly.' });
    } catch (err) { next(err); }
}

// ─── Backup Plan ──────────────────────────────────────────────────────────────

export async function getPlan(req: Request, res: Response, next: NextFunction) {
    try {
        const orgId = req.user!.organizationId;
        const data = await service.getOrgBackupPlan(orgId);
        const requests = await service.listOwnPlanRequests(orgId);
        res.json({ success: true, data: { ...data, requests } });
    } catch (err) { next(err); }
}

export async function requestPlan(req: Request, res: Response, next: NextFunction) {
    try {
        const orgId = req.user!.organizationId;
        const { userId } = req.user!;
        const userName = (req.user as any).name ?? userId;
        const body = requestPlanSchema.shape.body.parse(req.body);
        const row = await service.requestBackupPlan(orgId, userId, userName, body.requestedPlan, body.note);
        res.status(201).json({ success: true, data: row });
    } catch (err) { next(err); }
}

// ─── Super Admin plan management ──────────────────────────────────────────────

export async function listPlanRequests(req: Request, res: Response, next: NextFunction) {
    try {
        const status = typeof req.query.status === 'string' ? req.query.status : undefined;
        const rows = await service.listPlanRequests(status);
        res.json({ success: true, data: rows });
    } catch (err) { next(err); }
}

export async function approvePlan(req: Request, res: Response, next: NextFunction) {
    try {
        const { adminNote } = resolvePlanSchema.shape.body.parse(req.body);
        const row = await service.approvePlanRequest(String(req.params.id), req.user!.userId, adminNote);
        res.json({ success: true, data: row });
    } catch (err) { next(err); }
}

export async function rejectPlan(req: Request, res: Response, next: NextFunction) {
    try {
        const { adminNote } = resolvePlanSchema.shape.body.parse(req.body);
        const row = await service.rejectPlanRequest(String(req.params.id), req.user!.userId, adminNote);
        res.json({ success: true, data: row });
    } catch (err) { next(err); }
}
