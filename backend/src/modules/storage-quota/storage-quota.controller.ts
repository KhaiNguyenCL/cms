import { Request, Response, NextFunction } from 'express';
import * as svc from './storage-quota.service';
import { purchaseRequestSchema, adjustPoolSchema, resolveRequestSchema } from './storage-quota.schema';

// ─── Org-facing ───────────────────────────────────────────────────────────────

export async function getUsage(req: Request, res: Response, next: NextFunction) {
    try {
        const data = await svc.getStorageUsage(req.user!.organizationId);
        res.json({ success: true, data });
    } catch (err) { next(err); }
}

export async function createRequest(req: Request, res: Response, next: NextFunction) {
    try {
        const body = purchaseRequestSchema.shape.body.parse(req.body);
        const data = await svc.createPurchaseRequest(
            req.user!.organizationId,
            req.user!.userId,
            (req.user as any).name ?? req.user!.userId,
            body,
        );
        res.status(201).json({ success: true, data });
    } catch (err) { next(err); }
}

export async function listOwnRequests(req: Request, res: Response, next: NextFunction) {
    try {
        const data = await svc.listOwnRequests(req.user!.organizationId);
        res.json({ success: true, data });
    } catch (err) { next(err); }
}

// ─── Platform Admin routes ────────────────────────────────────────────────────

export async function getAllOrgStats(_req: Request, res: Response, next: NextFunction) {
    try {
        const data = await svc.getAllOrgStorageStats();
        res.json({ success: true, data });
    } catch (err) { next(err); }
}

export async function adjustPool(req: Request, res: Response, next: NextFunction) {
    try {
        const body = adjustPoolSchema.shape.body.parse(req.body);
        const performerId   = (req as any).platformAdmin?.id   ?? req.user?.userId  ?? 'system';
        const performerName = (req as any).platformAdmin?.username ?? req.user?.userId ?? 'system';
        const data = await svc.adjustPool(req.params['orgId'] as string, body, performerId, performerName);
        res.json({ success: true, data });
    } catch (err) { next(err); }
}

export async function listAllRequests(req: Request, res: Response, next: NextFunction) {
    try {
        const status = req.query['status'] as string | undefined;
        const data = await svc.listAllPurchaseRequests(status);
        res.json({ success: true, data });
    } catch (err) { next(err); }
}

export async function approveRequest(req: Request, res: Response, next: NextFunction) {
    try {
        const body = resolveRequestSchema.shape.body.parse(req.body);
        const performerId   = (req as any).platformAdmin?.id       ?? req.user?.userId  ?? 'system';
        const performerName = (req as any).platformAdmin?.username  ?? req.user?.userId ?? 'system';
        const data = await svc.approvePurchaseRequest(req.params['id'] as string, body, performerId, performerName);
        res.json({ success: true, data });
    } catch (err) { next(err); }
}

export async function rejectRequest(req: Request, res: Response, next: NextFunction) {
    try {
        const body = resolveRequestSchema.shape.body.parse(req.body);
        const performerId   = (req as any).platformAdmin?.id       ?? req.user?.userId  ?? 'system';
        const performerName = (req as any).platformAdmin?.username  ?? req.user?.userId ?? 'system';
        const data = await svc.rejectPurchaseRequest(req.params['id'] as string, body, performerId, performerName);
        res.json({ success: true, data });
    } catch (err) { next(err); }
}
