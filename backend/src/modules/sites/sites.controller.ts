import type { Request, Response, NextFunction } from 'express';
import * as svc from './sites.service';
import type {
    ListSitesQuery,
    CreateSiteBody,
    UpdateSiteBody,
    UpdateSiteDevices,
} from './sites.schema';
import { broadcastSyncState } from '../../shared/socket/socket.server';
import { logAction } from '../action-history/action-history.service';

export async function listSites(req: Request, res: Response, next: NextFunction) {
    try {
        const siteFilter = req.user!.role === 'SITE_MANAGER' ? req.user!.siteId : null;
        const result = await svc.listSites(
            req.user!.organizationId,
            req.query as unknown as ListSitesQuery,
            siteFilter,
        );
        res.json({ data: result });
    } catch (err) { next(err); }
}

export async function getSite(req: Request, res: Response, next: NextFunction) {
    try {
        const siteFilter = req.user!.role === 'SITE_MANAGER' ? req.user!.siteId : null;
        const site = await svc.getSiteById(String(req.params.id), req.user!.organizationId, siteFilter);
        res.json({ data: site });
    } catch (err) { next(err); }
}

export async function createSite(req: Request, res: Response, next: NextFunction) {
    try {
        const site = await svc.createSite(
            req.user!.organizationId,
            req.body as CreateSiteBody,
        );
        logAction(req.user!.organizationId, req.user!.userId, 'CREATE', 'STORE', site.id, site.name).catch(() => {});
        res.status(201).json({ data: site });
    } catch (err) { next(err); }
}

export async function updateSite(req: Request, res: Response, next: NextFunction) {
    try {
        const siteFilter = req.user!.role === 'SITE_MANAGER' ? req.user!.siteId : null;
        if (siteFilter && String(req.params.id) !== siteFilter)
            throw { status: 403, message: 'Không có quyền chỉnh sửa site này' };
        const site = await svc.updateSite(
            String(req.params.id),
            req.user!.organizationId,
            req.body as UpdateSiteBody,
        );
        logAction(req.user!.organizationId, req.user!.userId, 'UPDATE', 'STORE', site.id, site.name).catch(() => {});
        res.json({ data: site });
    } catch (err) { next(err); }
}

export async function deleteSite(req: Request, res: Response, next: NextFunction) {
    try {
        const id = String(req.params.id);
        const { name } = await svc.deleteSite(id, req.user!.organizationId);
        logAction(req.user!.organizationId, req.user!.userId, 'DELETE', 'STORE', id, name).catch(() => {});
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
        const siteFilter = req.user!.role === 'SITE_MANAGER' ? req.user!.siteId : null;
        if (siteFilter && String(req.params.id) !== siteFilter)
            throw { status: 403, message: 'Không có quyền thao tác site này' };
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
        const siteFilter = req.user!.role === 'SITE_MANAGER' ? req.user!.siteId : null;
        if (siteFilter && String(req.params.id) !== siteFilter)
            throw { status: 403, message: 'Không có quyền thao tác site này' };
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
        const siteFilter = req.user!.role === 'SITE_MANAGER' ? req.user!.siteId : null;
        if (siteFilter && id !== siteFilter)
            throw { status: 403, message: 'Không có quyền thao tác site này' };
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
