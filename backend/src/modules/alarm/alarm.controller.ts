import type { Request, Response, NextFunction } from 'express';
import * as alarmService from './alarm.service';

export async function getDevices(req: Request, res: Response, next: NextFunction) {
    try {
        const orgId = req.user!.organizationId;
        const devices = await alarmService.getAlarmDevices(orgId);
        res.json(devices);
    } catch (err) { next(err); }
}

export async function getDeviceHistory(req: Request, res: Response, next: NextFunction) {
    try {
        const orgId = String(req.user!.organizationId);
        const id    = String(req.params.id);
        const limit = Math.min(Number(String(req.query.limit ?? '100')) || 100, 500);
        const history = await alarmService.getDeviceStatusHistory(id, orgId, limit);
        res.json(history);
    } catch (err) { next(err); }
}

export async function getOrgHistory(req: Request, res: Response, next: NextFunction) {
    try {
        const orgId = String(req.user!.organizationId);
        const limit = Math.min(Number(String(req.query.limit ?? '200')) || 200, 1000);
        const history = await alarmService.getOrgStatusHistory(orgId, limit);
        res.json(history);
    } catch (err) { next(err); }
}

export async function getEmails(req: Request, res: Response, next: NextFunction) {
    try {
        const emails = await alarmService.getAlarmEmails(req.user!.organizationId);
        res.json(emails);
    } catch (err) { next(err); }
}

export async function addEmail(req: Request, res: Response, next: NextFunction) {
    try {
        const email = await alarmService.addAlarmEmail(req.user!.organizationId, req.body.email);
        res.status(201).json(email);
    } catch (err) { next(err); }
}

export async function updateEmail(req: Request, res: Response, next: NextFunction) {
    try {
        const email = await alarmService.updateAlarmEmail(String(req.params.emailId), String(req.user!.organizationId), req.body);
        res.json(email);
    } catch (err) { next(err); }
}

export async function deleteEmail(req: Request, res: Response, next: NextFunction) {
    try {
        await alarmService.deleteAlarmEmail(String(req.params.emailId), String(req.user!.organizationId));
        res.status(204).end();
    } catch (err) { next(err); }
}

export async function testEmail(req: Request, res: Response, next: NextFunction) {
    try {
        await alarmService.sendTestEmail(req.user!.organizationId, req.body.to);
        res.json({ ok: true });
    } catch (err) { next(err); }
}
