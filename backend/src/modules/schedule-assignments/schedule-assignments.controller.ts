import type { Request, Response, NextFunction } from 'express';
import * as svc from './schedule-assignments.service';
import { bulkAssignSchema, bulkUnassignSchema, reorderSchema } from './schedule-assignments.schema';
import { AppError } from '../../shared/middleware/error.middleware';

export async function list(req: Request, res: Response, next: NextFunction) {
    try {
        const { organizationId } = req.user!;
        const { targetType, targetId, scheduleId, siteId } = req.query as Record<string, string | undefined>;
        const data = await svc.listAssignments(organizationId, targetType, targetId, scheduleId, siteId);
        res.json({ data });
    } catch (err) { next(err); }
}

export async function bulkAssign(req: Request, res: Response, next: NextFunction) {
    try {
        const parsed = bulkAssignSchema.safeParse(req.body);
        if (!parsed.success) throw new AppError(400, parsed.error.errors[0].message);
        const { organizationId, userId } = req.user!;
        const result = await svc.bulkAssign(organizationId, parsed.data.scheduleId, parsed.data.targets, userId ?? null);
        res.status(201).json(result);
    } catch (err) { next(err); }
}

export async function unassignOne(req: Request, res: Response, next: NextFunction) {
    try {
        const { organizationId } = req.user!;
        await svc.unassignOne(organizationId, req.params.id as string);
        res.json({ success: true });
    } catch (err) { next(err); }
}

export async function bulkUnassign(req: Request, res: Response, next: NextFunction) {
    try {
        const parsed = bulkUnassignSchema.safeParse(req.body);
        if (!parsed.success) throw new AppError(400, parsed.error.errors[0].message);
        const { organizationId } = req.user!;
        const result = await svc.bulkUnassign(organizationId, parsed.data.ids);
        res.json(result);
    } catch (err) { next(err); }
}

export async function reorder(req: Request, res: Response, next: NextFunction) {
    try {
        const parsed = reorderSchema.safeParse(req.body);
        if (!parsed.success) throw new AppError(400, parsed.error.errors[0].message);
        const { organizationId } = req.user!;
        await svc.reorderAssignments(organizationId, parsed.data.targetType, parsed.data.targetId, parsed.data.orderedIds);
        res.json({ success: true });
    } catch (err) { next(err); }
}
