import type { Request, Response, NextFunction } from 'express';
import * as svc from './software-history.service';

export async function getDevices(req: Request, res: Response, next: NextFunction) {
    try {
        res.json(await svc.getSoftwareDevices(String(req.user!.organizationId)));
    } catch (err) { next(err); }
}

export async function getDeviceLogs(req: Request, res: Response, next: NextFunction) {
    try {
        const limit = Math.min(Number(String(req.query.limit ?? '100')) || 100, 500);
        res.json(await svc.getDeviceVersionLogs(String(req.params.id), String(req.user!.organizationId), limit));
    } catch (err) { next(err); }
}

export async function listVersions(req: Request, res: Response, next: NextFunction) {
    try {
        res.json(await svc.listVersions(String(req.user!.organizationId)));
    } catch (err) { next(err); }
}

export async function createVersion(req: Request, res: Response, next: NextFunction) {
    try {
        const ver = await svc.createVersion(String(req.user!.organizationId), req.body);
        res.status(201).json(ver);
    } catch (err) { next(err); }
}

export async function setLatest(req: Request, res: Response, next: NextFunction) {
    try {
        res.json(await svc.setLatestVersion(String(req.params.id), String(req.user!.organizationId)));
    } catch (err) { next(err); }
}

export async function deleteVersion(req: Request, res: Response, next: NextFunction) {
    try {
        await svc.deleteVersion(String(req.params.id), String(req.user!.organizationId));
        res.status(204).end();
    } catch (err) { next(err); }
}

export async function pushOta(req: Request, res: Response, next: NextFunction) {
    try {
        const result = await svc.pushOtaUpdate(
            String(req.params.id),
            String(req.user!.organizationId),
            String(req.body.versionId),
            String(req.user!.userId ?? 'admin')
        );
        res.json(result);
    } catch (err) { next(err); }
}

export async function pushOtaAll(req: Request, res: Response, next: NextFunction) {
    try {
        const result = await svc.pushOtaToAll(
            String(req.user!.organizationId),
            String(req.body.versionId),
            String(req.user!.userId ?? 'admin')
        );
        res.json(result);
    } catch (err) { next(err); }
}

export async function getReport(req: Request, res: Response, next: NextFunction) {
    try {
        res.json(await svc.getOutdatedReport(String(req.user!.organizationId)));
    } catch (err) { next(err); }
}
