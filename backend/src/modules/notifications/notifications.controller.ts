import { Request, Response, NextFunction } from 'express';
import * as svc from './notifications.service';

export async function list(req: Request, res: Response, next: NextFunction) {
    try {
        const limit = Math.min(parseInt(req.query['limit'] as string) || 50, 200);
        const unread = req.query['unread'] === 'true';
        const data = await svc.listNotifications(req.user!.organizationId, limit, unread);
        const unreadCount = await svc.countUnread(req.user!.organizationId);
        res.json({ success: true, data, unreadCount });
    } catch (err) { next(err); }
}

export async function read(req: Request, res: Response, next: NextFunction) {
    try {
        await svc.markRead(req.params['id'] as string, req.user!.organizationId);
        res.json({ success: true });
    } catch (err) { next(err); }
}

export async function readAll(req: Request, res: Response, next: NextFunction) {
    try {
        await svc.markAllRead(req.user!.organizationId);
        res.json({ success: true });
    } catch (err) { next(err); }
}

export async function remove(req: Request, res: Response, next: NextFunction) {
    try {
        await svc.deleteNotification(req.params['id'] as string, req.user!.organizationId);
        res.json({ success: true });
    } catch (err) { next(err); }
}
