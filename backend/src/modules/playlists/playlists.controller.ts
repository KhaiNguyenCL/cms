import { Request, Response, NextFunction } from 'express';
import * as playlistService from './playlists.service';
import { listPlaylistsSchema } from './playlists.schema';
import { signMediaUrl } from '../media/media.signing';

// GET /api/playlists
export async function listPlaylists(req: Request, res: Response, next: NextFunction) {
    try {
        const parsed = listPlaylistsSchema.shape.query.parse(req.query);
        const result = await playlistService.listPlaylists(req.user!.organizationId, parsed);
        res.json({ success: true, ...result });
    } catch (err) { next(err); }
}

// POST /api/playlists
export async function createPlaylist(req: Request, res: Response, next: NextFunction) {
    try {
        const playlist = await playlistService.createPlaylist(req.user!.organizationId, req.body);
        res.status(201).json({ success: true, message: 'Tạo playlist thành công', data: playlist });
    } catch (err) { next(err); }
}

// GET /api/playlists/:id
export async function getPlaylistById(req: Request, res: Response, next: NextFunction) {
    try {
        const { playlist, items } = await playlistService.getPlaylistById(
            req.params.id as string,
            req.user!.organizationId
        );
        // Map flat item rows → nested media object + signed thumbnail URL
        const mappedItems = items.map((item) => ({
            id: item.id,
            playlistId: item.playlistId,
            mediaId: item.mediaId,
            displayOrder: item.position,
            duration: item.durationOverride ?? item.mediaDuration ?? 30,
            media: {
                id: item.mediaId,
                title: item.mediaTitle ?? '',
                type: item.mediaType ?? 'IMAGE',
                thumbnailPath: item.mediaThumbnailPath ?? null,
                duration: item.mediaDuration ?? null,
                thumbnailUrl: item.mediaThumbnailPath
                    ? signMediaUrl(item.mediaId, 'thumbnail')
                    : null,
            },
        }));
        // Return flat: { ...playlistFields, items } — khớp với frontend type
        res.json({ success: true, data: { ...playlist, items: mappedItems } });
    } catch (err) { next(err); }
}

// PUT /api/playlists/:id
export async function updatePlaylist(req: Request, res: Response, next: NextFunction) {
    try {
        const playlist = await playlistService.updatePlaylist(
            req.params.id as string,
            req.user!.organizationId,
            req.body
        );
        res.json({ success: true, message: 'Cập nhật playlist thành công', data: playlist });
    } catch (err) { next(err); }
}

// DELETE /api/playlists/:id
export async function deletePlaylist(req: Request, res: Response, next: NextFunction) {
    try {
        await playlistService.deletePlaylist(req.params.id as string, req.user!.organizationId);
        res.json({ success: true, message: 'Xoá playlist thành công' });
    } catch (err) { next(err); }
}

// POST /api/playlists/:id/items
export async function addItem(req: Request, res: Response, next: NextFunction) {
    try {
        const item = await playlistService.addItem(
            req.params.id as string,
            req.user!.organizationId,
            req.body
        );
        res.status(201).json({ success: true, message: 'Thêm media vào playlist thành công', data: item });
    } catch (err) { next(err); }
}

// PUT /api/playlists/:id/items/:itemId
export async function updateItem(req: Request, res: Response, next: NextFunction) {
    try {
        const item = await playlistService.updateItem(
            req.params.id as string,
            req.params.itemId as string,
            req.user!.organizationId,
            req.body
        );
        res.json({ success: true, message: 'Cập nhật item thành công', data: item });
    } catch (err) { next(err); }
}

// DELETE /api/playlists/:id/items/:itemId
export async function removeItem(req: Request, res: Response, next: NextFunction) {
    try {
        await playlistService.removeItem(
            req.params.id as string,
            req.params.itemId as string,
            req.user!.organizationId
        );
        res.json({ success: true, message: 'Xoá item khỏi playlist thành công' });
    } catch (err) { next(err); }
}

// PUT /api/playlists/:id/items/reorder
export async function reorderItems(req: Request, res: Response, next: NextFunction) {
    try {
        const items = await playlistService.reorderItems(
            req.params.id as string,
            req.user!.organizationId,
            req.body
        );
        res.json({ success: true, message: 'Sắp xếp lại thành công', data: items });
    } catch (err) { next(err); }
}
