import { Request, Response, NextFunction } from 'express';
import * as orgService from './organizations.service';

// GET /api/organizations/me
export async function getMyOrganization(req: Request, res: Response, next: NextFunction) {
    try {
        const org = await orgService.getMyOrganization(req.user!.organizationId);
        res.json({ success: true, data: org });
    } catch (err) {
        next(err);
    }
}

// PUT /api/organizations/me
export async function updateMyOrganization(req: Request, res: Response, next: NextFunction) {
    try {
        const org = await orgService.updateMyOrganization(req.user!.organizationId, req.body);
        res.json({
            success: true,
            message: 'Cập nhật thành công',
            data: org,
        });
    } catch (err) {
        next(err);
    }
}

// GET /api/organizations/me/stats
export async function getOrganizationStats(req: Request, res: Response, next: NextFunction) {
    try {
        const stats = await orgService.getOrganizationStats(req.user!.organizationId);
        res.json({ success: true, data: stats });
    } catch (err) {
        next(err);
    }
}

// GET /api/organizations  — SUPER_ADMIN only
export async function listAllOrganizations(_req: Request, res: Response, next: NextFunction) {
    try {
        const orgs = await orgService.listAllOrganizations();
        res.json({ success: true, data: orgs });
    } catch (err) {
        next(err);
    }
}

// PATCH /api/organizations/:id/status  — SUPER_ADMIN only
export async function setOrganizationStatus(req: Request, res: Response, next: NextFunction) {
    try {
        const id = req.params.id as string;
        const { isActive } = req.body as { isActive: boolean };
        const org = await orgService.setOrganizationActive(id, isActive, req.user!.userId);
        res.json({ success: true, data: org });
    } catch (err) {
        next(err);
    }
}


// GET /api/organizations/me/license
export async function getMyLicenseInfo(req: Request, res: Response, next: NextFunction) {
    try {
        const info = await orgService.getLicenseInfo(req.user!.organizationId);
        res.json({ success: true, data: info });
    } catch (err) {
        next(err);
    }
}

// GET /api/organizations/:id/license  — SUPER_ADMIN
export async function getOrgLicenseInfo(req: Request, res: Response, next: NextFunction) {
    try {
        const id = req.params.id as string;
        const info = await orgService.getLicenseInfo(id);
        res.json({ success: true, data: info });
    } catch (err) {
        next(err);
    }
}

// PATCH /api/organizations/me/device-pin  — ADMIN only
export async function updateDevicePin(req: Request, res: Response, next: NextFunction) {
    try {
        await orgService.updateDevicePin(req.user!.organizationId, req.body.pin);
        res.json({ success: true, message: 'PIN thiết bị đã được cập nhật' });
    } catch (err) {
        next(err);
    }
}

// POST /api/organizations/:id/license/add-points  — SUPER_ADMIN
export async function addPoints(req: Request, res: Response, next: NextFunction) {
    try {
        const id = req.params.id as string;
        const info = await orgService.addPoints(id, req.body, req.user!.userId);
        res.json({ success: true, message: 'Points đã được cộng thêm', data: info });
    } catch (err) {
        next(err);
    }
}
