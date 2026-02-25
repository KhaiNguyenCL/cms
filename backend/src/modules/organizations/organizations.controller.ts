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
        const { id } = req.params;
        const { isActive } = req.body as { isActive: boolean };
        const org = await orgService.setOrganizationActive(id, isActive, req.user!.userId);
        res.json({ success: true, data: org });
    } catch (err) {
        next(err);
    }
}
