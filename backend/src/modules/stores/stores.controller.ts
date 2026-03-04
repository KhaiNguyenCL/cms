import type { Request, Response, NextFunction } from 'express';
import * as svc from './stores.service';
import type {
    ListStoresQuery,
    CreateStoreBody,
    UpdateStoreBody,
    UpdateStoreDevices,
} from './stores.schema';
import { broadcastSyncState } from '../../shared/socket/socket.server';

export async function listStores(req: Request, res: Response, next: NextFunction) {
    try {
        const result = await svc.listStores(
            req.user!.organizationId,
            req.query as unknown as ListStoresQuery,
        );
        res.json({ data: result });
    } catch (err) { next(err); }
}

export async function getStore(req: Request, res: Response, next: NextFunction) {
    try {
        const store = await svc.getStoreById(String(req.params.id), req.user!.organizationId);
        res.json({ data: store });
    } catch (err) { next(err); }
}

export async function createStore(req: Request, res: Response, next: NextFunction) {
    try {
        const store = await svc.createStore(
            req.user!.organizationId,
            req.body as CreateStoreBody,
        );
        res.status(201).json({ data: store });
    } catch (err) { next(err); }
}

export async function updateStore(req: Request, res: Response, next: NextFunction) {
    try {
        const store = await svc.updateStore(
            String(req.params.id),
            req.user!.organizationId,
            req.body as UpdateStoreBody,
        );
        res.json({ data: store });
    } catch (err) { next(err); }
}

export async function deleteStore(req: Request, res: Response, next: NextFunction) {
    try {
        const id = String(req.params.id);
        await svc.deleteStore(id, req.user!.organizationId);
        broadcastSyncState(req.user!.organizationId, {
            storeId: id,
            startEpoch: null,
            totalDurationMs: null,
            playlistId: null,
        });
        res.json({ data: { message: 'Đã xóa store' } });
    } catch (err) { next(err); }
}

export async function startStore(req: Request, res: Response, next: NextFunction) {
    try {
        const result = await svc.startStore(String(req.params.id), req.user!.organizationId);
        broadcastSyncState(req.user!.organizationId, {
            storeId: result.id,
            startEpoch: result.startEpoch,
            totalDurationMs: result.totalDurationMs,
            playlistId: result.playlistId,
        });
        res.json({ data: result });
    } catch (err) { next(err); }
}

export async function restartStore(req: Request, res: Response, next: NextFunction) {
    try {
        const result = await svc.startStore(String(req.params.id), req.user!.organizationId);
        broadcastSyncState(req.user!.organizationId, {
            storeId: result.id,
            startEpoch: result.startEpoch,
            totalDurationMs: result.totalDurationMs,
            playlistId: result.playlistId,
        });
        res.json({ data: result });
    } catch (err) { next(err); }
}

export async function stopStore(req: Request, res: Response, next: NextFunction) {
    try {
        const id = String(req.params.id);
        await svc.stopStore(id, req.user!.organizationId);
        broadcastSyncState(req.user!.organizationId, {
            storeId: id,
            startEpoch: null,
            totalDurationMs: null,
            playlistId: null,
        });
        res.json({ data: { message: 'Đã dừng sync store' } });
    } catch (err) { next(err); }
}

export async function updateStoreDevices(req: Request, res: Response, next: NextFunction) {
    try {
        const store = await svc.updateStoreDevices(
            String(req.params.id),
            req.user!.organizationId,
            req.body as UpdateStoreDevices,
        );
        res.json({ data: store });
    } catch (err) { next(err); }
}
