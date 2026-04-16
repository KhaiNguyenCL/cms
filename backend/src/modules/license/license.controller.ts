import { Request, Response, NextFunction } from 'express';
import * as svc from './license.service';
import type { PackageType } from './license.service';
import { queryOne } from '../../shared/database/db';

async function actor(req: Request): Promise<{ id: string; name: string }> {
    const id  = req.user!.userId;
    const row = await queryOne<{ email: string }>(`SELECT email FROM users WHERE id = $1`, [id]);
    return { id, name: row?.email ?? id };
}

// GET /api/license/stats
export async function getStats(req: Request, res: Response, next: NextFunction) {
    try {
        const data = await svc.getStats(req.user!.organizationId);
        res.json({ success: true, data });
    } catch (err) { next(err); }
}

// GET /api/license/pool
export async function getPool(req: Request, res: Response, next: NextFunction) {
    try {
        const data = await svc.getPool(req.user!.organizationId);
        res.json({ success: true, data });
    } catch (err) { next(err); }
}

// GET /api/license/admin/orgs/:orgId/detail  (SUPER_ADMIN)
export async function getOrgDetail(req: Request, res: Response, next: NextFunction) {
    try {
        const data = await svc.getOrgDetail(String(req.params.orgId));
        res.json({ success: true, data });
    } catch (err) { next(err); }
}

// GET /api/license/admin/orgs  (SUPER_ADMIN)
export async function getAllOrgPools(req: Request, res: Response, next: NextFunction) {
    try {
        const data = await svc.getAllOrgPools();
        res.json({ success: true, data });
    } catch (err) { next(err); }
}

// PATCH /api/license/admin/orgs/:orgId/pool  (SUPER_ADMIN)
export async function updateOrgPool(req: Request, res: Response, next: NextFunction) {
    try {
        const { pkg12m, pkg24m, pkg36m } = req.body;
        const { id, name } = await actor(req);
        const data = await svc.updatePool(String(req.params.orgId), { pkg12m, pkg24m, pkg36m }, id, name);
        res.json({ success: true, data });
    } catch (err) { next(err); }
}

// GET /api/license/devices
export async function getDeviceLicenses(req: Request, res: Response, next: NextFunction) {
    try {
        const data = await svc.getDeviceLicenses(req.user!.organizationId);
        res.json({ success: true, data });
    } catch (err) { next(err); }
}

// POST /api/license/assign  (ADMIN)
export async function assignLicense(req: Request, res: Response, next: NextFunction) {
    try {
        const { deviceId, packageType } = req.body;
        const { id, name } = await actor(req);
        await svc.assignLicense(req.user!.organizationId, deviceId, packageType as PackageType, id, name);
        res.json({ success: true });
    } catch (err) { next(err); }
}


// GET /api/license/history
export async function getHistory(req: Request, res: Response, next: NextFunction) {
    try {
        const raw      = req.query.limit;
        const parsed   = parseInt(String(Array.isArray(raw) ? raw[0] : (raw ?? '100')));
        const limit    = Math.min(isNaN(parsed) ? 100 : parsed, 500);
        const deviceId = req.query.deviceId ? String(req.query.deviceId) : undefined;
        const data  = await svc.getHistory(req.user!.organizationId, limit, deviceId);
        res.json({ success: true, data });
    } catch (err) { next(err); }
}

// GET /api/license/requests
export async function getPurchaseRequests(req: Request, res: Response, next: NextFunction) {
    try {
        const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';
        const data = await svc.getPurchaseRequests(req.user!.organizationId, isSuperAdmin);
        res.json({ success: true, data });
    } catch (err) { next(err); }
}

// POST /api/license/requests  (ADMIN/MANAGER)
export async function createPurchaseRequest(req: Request, res: Response, next: NextFunction) {
    try {
        const { packageType, quantity, note } = req.body;
        const { id, name } = await actor(req);
        const data = await svc.createPurchaseRequest(
            req.user!.organizationId, id, name,
            packageType as PackageType, Number(quantity), note,
        );
        res.status(201).json({ success: true, data });
    } catch (err) { next(err); }
}

// POST /api/license/requests/:id/approve  (SUPER_ADMIN)
export async function approvePurchaseRequest(req: Request, res: Response, next: NextFunction) {
    try {
        const { adminNote } = req.body;
        const { id, name } = await actor(req);
        await svc.approvePurchaseRequest(String(req.params.id), id, name, adminNote);
        res.json({ success: true });
    } catch (err) { next(err); }
}

// POST /api/license/requests/:id/reject  (SUPER_ADMIN)
export async function rejectPurchaseRequest(req: Request, res: Response, next: NextFunction) {
    try {
        const { adminNote } = req.body;
        const { id } = await actor(req);
        await svc.rejectPurchaseRequest(String(req.params.id), id, adminNote);
        res.json({ success: true });
    } catch (err) { next(err); }
}

// POST /api/license/admin/orgs/:orgId/transfer  (SUPER_ADMIN)
export async function adminTransferLicense(req: Request, res: Response, next: NextFunction) {
    try {
        const { fromDeviceId, toDeviceId } = req.body;
        const { id, name } = await actor(req);
        await svc.transferLicense(String(req.params.orgId), fromDeviceId, toDeviceId, id, name);
        res.json({ success: true });
    } catch (err) { next(err); }
}

// DELETE /api/license/admin/orgs/:orgId/revoke/:deviceId  (SUPER_ADMIN)
export async function adminRevokeLicense(req: Request, res: Response, next: NextFunction) {
    try {
        const { id, name } = await actor(req);
        await svc.revokeLicense(String(req.params.orgId), String(req.params.deviceId), id, name);
        res.json({ success: true });
    } catch (err) { next(err); }
}

// GET /api/license/transfer-requests
export async function getTransferRequests(req: Request, res: Response, next: NextFunction) {
    try {
        const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';
        const data = await svc.getTransferRequests(req.user!.organizationId, isSuperAdmin);
        res.json({ success: true, data });
    } catch (err) { next(err); }
}

// POST /api/license/transfer-requests
export async function createTransferRequest(req: Request, res: Response, next: NextFunction) {
    try {
        const { fromDeviceId, toDeviceId, note } = req.body;
        const { id, name } = await actor(req);
        const data = await svc.createTransferRequest(
            req.user!.organizationId, fromDeviceId, toDeviceId, id, name, note,
        );
        res.status(201).json({ success: true, data });
    } catch (err) { next(err); }
}

// POST /api/license/transfer-requests/:id/approve  (SUPER_ADMIN)
export async function approveTransferRequest(req: Request, res: Response, next: NextFunction) {
    try {
        const { adminNote } = req.body;
        const { id, name } = await actor(req);
        await svc.approveTransferRequest(String(req.params.id), id, name, adminNote);
        res.json({ success: true });
    } catch (err) { next(err); }
}

// POST /api/license/transfer-requests/:id/reject  (SUPER_ADMIN)
export async function rejectTransferRequest(req: Request, res: Response, next: NextFunction) {
    try {
        const { adminNote } = req.body;
        const { id } = await actor(req);
        await svc.rejectTransferRequest(String(req.params.id), id, adminNote);
        res.json({ success: true });
    } catch (err) { next(err); }
}

// POST /api/license/admin/orgs/:orgId/adjust-expiry  (SUPER_ADMIN)
export async function adminAdjustExpiry(req: Request, res: Response, next: NextFunction) {
    try {
        const { deviceId, newExpiresAt } = req.body;
        const { id, name } = await actor(req);
        await svc.adjustExpiry(String(req.params.orgId), deviceId, newExpiresAt, id, name);
        res.json({ success: true });
    } catch (err) { next(err); }
}
