import type { Request, Response, NextFunction } from 'express';
import * as svc from './sync-groups.service';
import type {
    ListSyncGroupsQuery,
    CreateSyncGroupBody,
    UpdateSyncGroupBody,
    UpdateSyncGroupDevices,
} from './sync-groups.schema';
import { broadcastSyncState } from '../../shared/socket/socket.server';

export async function listSyncGroups(req: Request, res: Response, next: NextFunction) {
    try {
        const result = await svc.listSyncGroups(
            req.user!.organizationId,
            req.query as unknown as ListSyncGroupsQuery,
        );
        res.json({ data: result });
    } catch (err) { next(err); }
}

export async function getSyncGroup(req: Request, res: Response, next: NextFunction) {
    try {
        const group = await svc.getSyncGroupById(String(req.params.id), req.user!.organizationId);
        res.json({ data: group });
    } catch (err) { next(err); }
}

export async function createSyncGroup(req: Request, res: Response, next: NextFunction) {
    try {
        const group = await svc.createSyncGroup(
            req.user!.organizationId,
            req.body as CreateSyncGroupBody,
        );
        res.status(201).json({ data: group });
    } catch (err) { next(err); }
}

export async function updateSyncGroup(req: Request, res: Response, next: NextFunction) {
    try {
        const group = await svc.updateSyncGroup(
            String(req.params.id),
            req.user!.organizationId,
            req.body as UpdateSyncGroupBody,
        );
        res.json({ data: group });
    } catch (err) { next(err); }
}

export async function deleteSyncGroup(req: Request, res: Response, next: NextFunction) {
    try {
        const id = String(req.params.id);
        await svc.deleteSyncGroup(id, req.user!.organizationId);
        broadcastSyncState(req.user!.organizationId, {
            storeId: id,
            startEpoch: null,
            totalDurationMs: null,
            playlistId: null,
        });
        res.json({ data: { message: 'Đã xóa sync group' } });
    } catch (err) { next(err); }
}

export async function startSyncGroup(req: Request, res: Response, next: NextFunction) {
    try {
        const result = await svc.startSyncGroup(String(req.params.id), req.user!.organizationId);
        broadcastSyncState(req.user!.organizationId, {
            storeId: result.id,
            startEpoch: result.startEpoch,
            totalDurationMs: result.totalDurationMs,
            playlistId: result.playlistId,
        });
        res.json({ data: result });
    } catch (err) { next(err); }
}

export async function restartSyncGroup(req: Request, res: Response, next: NextFunction) {
    try {
        const result = await svc.startSyncGroup(String(req.params.id), req.user!.organizationId);
        broadcastSyncState(req.user!.organizationId, {
            storeId: result.id,
            startEpoch: result.startEpoch,
            totalDurationMs: result.totalDurationMs,
            playlistId: result.playlistId,
        });
        res.json({ data: result });
    } catch (err) { next(err); }
}

export async function stopSyncGroup(req: Request, res: Response, next: NextFunction) {
    try {
        const id = String(req.params.id);
        await svc.stopSyncGroup(id, req.user!.organizationId);
        broadcastSyncState(req.user!.organizationId, {
            storeId: id,
            startEpoch: null,
            totalDurationMs: null,
            playlistId: null,
        });
        res.json({ data: { message: 'Đã dừng sync group' } });
    } catch (err) { next(err); }
}

export async function updateSyncGroupDevices(req: Request, res: Response, next: NextFunction) {
    try {
        const group = await svc.updateSyncGroupDevices(
            String(req.params.id),
            req.user!.organizationId,
            req.body as UpdateSyncGroupDevices,
        );
        res.json({ data: group });
    } catch (err) { next(err); }
}
