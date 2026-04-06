import type { Request, Response, NextFunction } from 'express';
import * as svc from './action-history.service';
import type { ActionType, ResourceType } from './action-history.service';

export async function getLogs(req: Request, res: Response, next: NextFunction) {
    try {
        const limit  = Math.min(Number(String(req.query.limit  ?? '50'))  || 50,  200);
        const offset = Number(String(req.query.offset ?? '0')) || 0;

        const result = await svc.listActionLogs(String(req.user!.organizationId), {
            userId:       req.query.userId       ? String(req.query.userId)       : undefined,
            action:       req.query.action       ? String(req.query.action)       as ActionType : undefined,
            resourceType: req.query.resourceType ? String(req.query.resourceType) as ResourceType : undefined,
            dateFrom:     req.query.dateFrom     ? String(req.query.dateFrom)     : undefined,
            dateTo:       req.query.dateTo       ? String(req.query.dateTo)       : undefined,
            search:       req.query.search       ? String(req.query.search)       : undefined,
            limit,
            offset,
        });
        res.json(result);
    } catch (err) { next(err); }
}

export async function getActors(req: Request, res: Response, next: NextFunction) {
    try {
        res.json(await svc.getActionActors(String(req.user!.organizationId)));
    } catch (err) { next(err); }
}
