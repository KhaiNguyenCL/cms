import type { Request, Response, NextFunction } from 'express';
import * as svc from './sites.service';
import type {
    ListSitesQuery,
    CreateSiteBody,
    UpdateSiteBody,
    UpdateSiteDevices,
} from './sites.schema';
import { broadcastSyncState } from '../../shared/socket/socket.server';

export async function listSites(req: Request, res: Response, next: NextFunction) {
    try {
        const result = await svc.listSites(
            req.user!.organizationId,
            req.query as unknown as ListSitesQuery,
        );
        res.json({ data: result });
    } catch (err) { next(err); }
}

export async function getSite(req: Request, res: Response, next: NextFunction) {
    try {
        const site = await svc.getSiteById(String(req.params.id), req.user!.organizationId);
        res.json({ data: site });
    } catch (err) { next(err); }
}

export async function createSite(req: Request, res: Response, next: NextFunction) {
    try {
        const site = await svc.createSite(
            req.user!.organizationId,
            req.body as CreateSiteBody,
        );
        res.status(201).json({ data: site });
    } catch (err) { next(err); }
}

export async function updateSite(req: Request, res: Response, next: NextFunction) {
    try {
        const site = await svc.updateSite(
            String(req.params.id),
            req.user!.organizationId,
            req.body as UpdateSiteBody,
        );
        res.json({ data: site });
    } catch (err) { next(err); }
}

export async function deleteSite(req: Request, res: Response, next: NextFunction) {
    try {
        const id = String(req.params.id);
        await svc.deleteSite(id, req.user!.organizationId);
        broadcastSyncState(req.user!.organizationId, {
            storeId: id,
            startEpoch: null,
            totalDurationMs: null,
            playlistId: null,
        });
        res.json({ data: { message: 'Đã xóa site' } });
    } catch (err) { next(err); }
}

export async function startSite(req: Request, res: Response, next: NextFunction) {
    try {
        const result = await svc.startSite(String(req.params.id), req.user!.organizationId);
        broadcastSyncState(req.user!.organizationId, {
            storeId: result.id,
            startEpoch: result.startEpoch,
            totalDurationMs: result.totalDurationMs,
            playlistId: result.playlistId,
        });
        res.json({ data: result });
    } catch (err) { next(err); }
}

export async function restartSite(req: Request, res: Response, next: NextFunction) {
    try {
        const result = await svc.startSite(String(req.params.id), req.user!.organizationId);
        broadcastSyncState(req.user!.organizationId, {
            storeId: result.id,
            startEpoch: result.startEpoch,
            totalDurationMs: result.totalDurationMs,
            playlistId: result.playlistId,
        });
        res.json({ data: result });
    } catch (err) { next(err); }
}

export async function stopSite(req: Request, res: Response, next: NextFunction) {
    try {
        const id = String(req.params.id);
        await svc.stopSite(id, req.user!.organizationId);
        broadcastSyncState(req.user!.organizationId, {
            storeId: id,
            startEpoch: null,
            totalDurationMs: null,
            playlistId: null,
        });
        res.json({ data: { message: 'Đã dừng sync site' } });
    } catch (err) { next(err); }
}

export async function updateSiteDevices(req: Request, res: Response, next: NextFunction) {
    try {
        const site = await svc.updateSiteDevices(
            String(req.params.id),
            req.user!.organizationId,
            req.body as UpdateSiteDevices,
        );
        res.json({ data: site });
    } catch (err) { next(err); }
}
