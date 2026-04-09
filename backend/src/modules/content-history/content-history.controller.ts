import type { Request, Response, NextFunction } from 'express';
import * as svc from './content-history.service';

export async function getDevices(req: Request, res: Response, next: NextFunction) {
    try {
        const data = await svc.getContentDevices(String(req.user!.organizationId));
        res.json(data);
    } catch (err) { next(err); }
}

export async function getDeviceLogs(req: Request, res: Response, next: NextFunction) {
    try {
        const result = await svc.getDeviceContentLogs(
            String(req.params.id),
            String(req.user!.organizationId),
            {
                dateFrom: req.query.dateFrom ? String(req.query.dateFrom) : undefined,
                dateTo:   req.query.dateTo   ? String(req.query.dateTo)   : undefined,
                limit:    req.query.limit    ? Number(req.query.limit)    : undefined,
                offset:   req.query.offset   ? Number(req.query.offset)   : undefined,
            }
        );
        res.json(result);
    } catch (err) { next(err); }
}
