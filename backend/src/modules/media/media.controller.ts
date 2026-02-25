import { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import * as mediaService from './media.service';
import { signMediaUrl, verifyMediaToken } from './media.signing';
import { uploadMiddleware } from './media.upload';
import { listMediaSchema } from './media.schema';
import { AppError } from '../../shared/middleware/error.middleware';
import config from '../../config';


// GET /api/media
export async function listMedia(req: Request, res: Response, next: NextFunction) {
    try {
        const parsed = listMediaSchema.shape.query.parse(req.query);
        const result = await mediaService.listMedia(req.user!.organizationId, parsed);
        const data = result.data.map(m => ({
            ...m,
            signedUrl: signMediaUrl(m.id, 'file'),
            thumbnailUrl: m.thumbnailPath ? signMediaUrl(m.id, 'thumbnail') : null,
        }));
        res.json({ success: true, ...result, data });
    } catch (err) { next(err); }
}

// POST /api/media/upload — multer middleware + service
export function handleUpload(req: Request, res: Response, next: NextFunction) {
    uploadMiddleware(req, res, async (err) => {
        if (err) return next(new AppError(400, err.message));
        if (!req.file) return next(new AppError(400, 'Không có file được tải lên'));

        try {
            const media = await mediaService.uploadMedia(
                req.user!.organizationId,
                req.user!.userId,
                req.file,
                req.body.title as string | undefined
            );
            res.status(201).json({
                success: true,
                message: 'Upload thành công',
                data: {
                    ...media,
                    signedUrl: signMediaUrl(media.id, 'file'),
                    thumbnailUrl: media.thumbnailPath ? signMediaUrl(media.id, 'thumbnail') : null,
                },
            });
        } catch (e) {
            // Clean up temp file on error
            if (req.file?.path && fs.existsSync(req.file.path)) {
                fs.unlinkSync(req.file.path);
            }
            next(e);
        }
    });
}

// GET /api/media/:id
export async function getMediaById(req: Request, res: Response, next: NextFunction) {
    try {
        const media = await mediaService.getMediaById(req.params.id as string, req.user!.organizationId);
        res.json({
            success: true,
            data: {
                ...media,
                signedUrl: signMediaUrl(media.id, 'file'),
                thumbnailUrl: media.thumbnailPath ? signMediaUrl(media.id, 'thumbnail') : null,
            },
        });
    } catch (err) { next(err); }
}

// PUT /api/media/:id
export async function updateMedia(req: Request, res: Response, next: NextFunction) {
    try {
        const media = await mediaService.updateMedia(req.params.id as string, req.user!.organizationId, req.body);
        res.json({ success: true, message: 'Cập nhật thành công', data: media });
    } catch (err) { next(err); }
}

// DELETE /api/media/:id
export async function deleteMedia(req: Request, res: Response, next: NextFunction) {
    try {
        await mediaService.deleteMedia(req.params.id as string, req.user!.organizationId);
        res.json({ success: true, message: 'Xoá media thành công' });
    } catch (err) { next(err); }
}

// GET /api/media/:id/thumbnail?expires=X&sig=Y
export async function getThumbnail(req: Request, res: Response, next: NextFunction) {
    try {
        const mediaId = req.params.id as string;
        const expires = typeof req.query.expires === 'string' ? req.query.expires : undefined;
        const sig = typeof req.query.sig === 'string' ? req.query.sig : undefined;
        if (!expires || !sig || !verifyMediaToken(mediaId, 'thumbnail', expires, sig)) {
            return res.status(401).json({ success: false, message: 'URL không hợp lệ hoặc đã hết hạn' });
        }

        const thumbPath = await mediaService.getMediaThumbnailPathPublic(req.params.id as string);
        const ext = path.extname(thumbPath).toLowerCase();
        const mimeMap: Record<string, string> = {
            '.webp': 'image/webp', '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif',
        };
        const contentType = mimeMap[ext] || 'image/webp';

        // Cho phép frontend admin (khác origin) nhúng ảnh/video
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

        if (config.nginx.accel) {
            // Production: Nginx serve file trực tiếp qua X-Accel-Redirect
            const rel = path.relative(config.storage.root, thumbPath).replace(/\\/g, '/');
            res.setHeader('X-Accel-Redirect', `${config.nginx.accelPrefix}/${rel}`);
            res.setHeader('Content-Type', contentType);
            res.setHeader('Cache-Control', 'public, max-age=86400');
            res.end();
        } else {
            // Development: stream trực tiếp từ Node.js
            res.setHeader('Content-Type', contentType);
            res.setHeader('Cache-Control', 'public, max-age=86400');
            fs.createReadStream(thumbPath).pipe(res);
        }
    } catch (err) { next(err); }
}

// GET /api/media/:id/file?expires=X&sig=Y
export async function getMediaFile(req: Request, res: Response, next: NextFunction) {
    try {
        const mediaId = req.params.id as string;
        const expires = typeof req.query.expires === 'string' ? req.query.expires : undefined;
        const sig = typeof req.query.sig === 'string' ? req.query.sig : undefined;
        if (!expires || !sig || !verifyMediaToken(mediaId, 'file', expires, sig)) {
            return res.status(401).json({ success: false, message: 'URL không hợp lệ hoặc đã hết hạn' });
        }

        const { filePath, mimeType, title } = await mediaService.getMediaFilePathPublic(req.params.id as string);
        const disposition = `inline; filename="${encodeURIComponent(title)}"`;

        // Cho phép frontend admin (khác origin) nhúng ảnh/video
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

        if (config.nginx.accel) {
            // Production: Nginx serve file trực tiếp qua X-Accel-Redirect.
            // Đặc biệt quan trọng với video lớn (≤2GB) — không block Node.js event loop.
            const rel = path.relative(config.storage.root, filePath).replace(/\\/g, '/');
            res.setHeader('X-Accel-Redirect', `${config.nginx.accelPrefix}/${rel}`);
            res.setHeader('Content-Type', mimeType);
            res.setHeader('Content-Disposition', disposition);
            res.setHeader('Cache-Control', 'public, max-age=3600');
            res.end();
        } else {
            // Development: stream với HTTP Range support (cần thiết để tua video)
            const stat = fs.statSync(filePath);
            const fileSize = stat.size;
            const rangeHeader = req.headers['range'];

            res.setHeader('Content-Type', mimeType);
            res.setHeader('Content-Disposition', disposition);
            res.setHeader('Cache-Control', 'public, max-age=3600');
            res.setHeader('Accept-Ranges', 'bytes');

            if (rangeHeader) {
                // Partial content — browser đang seek đến vị trí cụ thể
                const [startStr, endStr] = rangeHeader.replace(/bytes=/, '').split('-');
                const start = parseInt(startStr, 10);
                const end = endStr ? parseInt(endStr, 10) : fileSize - 1;
                const chunkSize = end - start + 1;

                res.status(206);
                res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
                res.setHeader('Content-Length', chunkSize);
                fs.createReadStream(filePath, { start, end }).pipe(res);
            } else {
                // Full file
                res.setHeader('Content-Length', fileSize);
                fs.createReadStream(filePath).pipe(res);
            }
        }
    } catch (err) { next(err); }
}
