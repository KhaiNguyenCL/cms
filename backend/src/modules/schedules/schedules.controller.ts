import { Request, Response, NextFunction } from 'express';
import * as scheduleService from './schedules.service';
import { listSchedulesSchema } from './schedules.schema';
import { logAction } from '../action-history/action-history.service';

// GET /api/schedules
export async function listSchedules(req: Request, res: Response, next: NextFunction) {
    try {
        const parsed = listSchedulesSchema.shape.query.parse(req.query);
        const result = await scheduleService.listSchedules(req.user!.organizationId, parsed);
        res.json({ success: true, ...result });
    } catch (err) { next(err); }
}

// POST /api/schedules
export async function createSchedule(req: Request, res: Response, next: NextFunction) {
    try {
        const schedule = await scheduleService.createSchedule(req.user!.organizationId, req.body);
        logAction(req.user!.organizationId, req.user!.userId, 'CREATE', 'SCHEDULE', schedule.id, schedule.name).catch(() => {});
        res.status(201).json({ success: true, message: 'Tạo schedule thành công', data: schedule });
    } catch (err) { next(err); }
}

// GET /api/schedules/:id
export async function getScheduleById(req: Request, res: Response, next: NextFunction) {
    try {
        const schedule = await scheduleService.getScheduleById(req.params.id as string, req.user!.organizationId);
        res.json({ success: true, data: schedule });
    } catch (err) { next(err); }
}

// PUT /api/schedules/:id
export async function updateSchedule(req: Request, res: Response, next: NextFunction) {
    try {
        const schedule = await scheduleService.updateSchedule(
            req.params.id as string,
            req.user!.organizationId,
            req.body
        );
        logAction(req.user!.organizationId, req.user!.userId, 'UPDATE', 'SCHEDULE', schedule.id, schedule.name).catch(() => {});
        res.json({ success: true, message: 'Cập nhật schedule thành công', data: schedule });
    } catch (err) { next(err); }
}

// DELETE /api/schedules/:id
export async function deleteSchedule(req: Request, res: Response, next: NextFunction) {
    try {
        const { name } = await scheduleService.deleteSchedule(req.params.id as string, req.user!.organizationId);
        logAction(req.user!.organizationId, req.user!.userId, 'DELETE', 'SCHEDULE', req.params.id as string, name).catch(() => {});
        res.json({ success: true, message: 'Xoá schedule thành công' });
    } catch (err) { next(err); }
}
