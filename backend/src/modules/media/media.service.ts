import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import sharp from 'sharp';
import { query, queryOne } from '../../shared/database/db';
import { AppError } from '../../shared/middleware/error.middleware';
import logger from '../../shared/utils/logger';
import { invalidateContentHashForOrg } from '../device-sync/device-sync.service';
import { tempDir, mediaDir, thumbDir, MAX_IMAGE_BYTES } from './media.upload';
import type { ListMediaQuery, UpdateMediaBody } from './media.schema';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MediaRow {
    id: string;
    organizationId: string;
    uploadedById: string;
    title: string;
    description: string | null;
    type: string;
    filePath: string;
    fileSize: number;
    mimeType: string;
    fileHash: string;
    duration: number | null;
    width: number | null;
    height: number | null;
    thumbnailPath: string | null;
    tags: string[];
    metadata: Record<string, unknown> | null;
    status: string;
    createdAt: string;
    updatedAt: string;
}

export interface PaginatedMedia {
    data: MediaRow[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fileHash(filePath: string): string {
    const buf = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(buf).digest('hex');
}

function detectType(mimeType: string): 'IMAGE' | 'VIDEO' {
    return mimeType.startsWith('image/') ? 'IMAGE' : 'VIDEO';
}

// ─── List media ───────────────────────────────────────────────────────────────

export async function listMedia(
    organizationId: string,
    q: ListMediaQuery
): Promise<PaginatedMedia> {
    const { page, limit, type, status, search } = q;
    const offset = (page - 1) * limit;
    const conditions: string[] = [`"organizationId" = $1`];
    const values: unknown[] = [organizationId];
    let idx = 2;

    if (type) { conditions.push(`type = $${idx++}`); values.push(type); }
    if (status) { conditions.push(`status = $${idx++}`); values.push(status); }
    if (search) { conditions.push(`title ILIKE $${idx++}`); values.push(`%${search}%`); }

    const where = conditions.join(' AND ');

    const [countRes, rows] = await Promise.all([
        queryOne<{ count: string }>(
            `SELECT COUNT(*) as count FROM media WHERE ${where}`, values
        ),
        query<MediaRow>(
            `SELECT id, "organizationId", "uploadedById", title, description, type,
                    "filePath", "fileSize", "mimeType", "fileHash", duration, width, height,
                    "thumbnailPath", tags, metadata, status, "createdAt", "updatedAt"
             FROM media WHERE ${where}
             ORDER BY "createdAt" DESC
             LIMIT $${idx++} OFFSET $${idx++}`,
            [...values, limit, offset]
        ),
    ]);

    const total = parseInt(countRes?.count ?? '0');
    return { data: rows, total, page, limit, totalPages: Math.ceil(total / limit) };
}

// ─── Get single ───────────────────────────────────────────────────────────────

export async function getMediaById(mediaId: string, organizationId: string): Promise<MediaRow> {
    const media = await queryOne<MediaRow>(
        `SELECT id, "organizationId", "uploadedById", title, description, type,
                "filePath", "fileSize", "mimeType", "fileHash", duration, width, height,
                "thumbnailPath", tags, metadata, status, "createdAt", "updatedAt"
         FROM media WHERE id = $1 AND "organizationId" = $2`,
        [mediaId, organizationId]
    );
    if (!media) throw new AppError(404, 'Media không tồn tại');
    return media;
}

// ─── Upload ────────────────────────────────────────────────────────────────────

export async function uploadMedia(
    organizationId: string,
    uploadedById: string,
    file: Express.Multer.File,
    title?: string
): Promise<MediaRow> {
    const mediaType = detectType(file.mimetype);

    // Validate size per type
    if (mediaType === 'IMAGE' && file.size > MAX_IMAGE_BYTES) {
        fs.unlinkSync(file.path);
        throw new AppError(413, `Ảnh quá lớn. Tối đa ${process.env.MAX_IMAGE_SIZE_MB || 50}MB`);
    }

    // Move temp file → final media dir
    const ext = path.extname(file.originalname).toLowerCase();
    const finalName = `${uuidv4()}${ext}`;
    const finalPath = path.join(mediaDir, finalName);
    fs.renameSync(file.path, finalPath);

    // Hash
    const hash = fileHash(finalPath);

    // Image metadata using sharp
    let width: number | null = null;
    let height: number | null = null;
    let thumbnailPath: string | null = null;

    if (mediaType === 'IMAGE') {
        try {
            const meta = await sharp(finalPath).metadata();
            width = meta.width ?? null;
            height = meta.height ?? null;

            // Generate thumbnail (320x180, webp)
            const thumbName = `thumb_${path.basename(finalName, ext)}.webp`;
            const thumbFull = path.join(thumbDir, thumbName);
            await sharp(finalPath)
                .resize(320, 180, { fit: 'inside', withoutEnlargement: true })
                .webp({ quality: 75 })
                .toFile(thumbFull);
            thumbnailPath = thumbFull;
        } catch (e) {
            logger.warn('Could not process image metadata', { error: (e as Error).message });
        }
    }

    const displayTitle = title || path.basename(file.originalname, ext);

    // Videos start as PROCESSING — the transcoding worker will set them READY.
    // Images are already processed above (sharp), so they go straight to READY.
    const initialStatus = mediaType === 'VIDEO' ? 'PROCESSING' : 'READY';

    const rows = await query<MediaRow>(
        `INSERT INTO media (
            id, "organizationId", "uploadedById", title, description, type,
            "filePath", "fileSize", "mimeType", "fileHash",
            duration, width, height, "thumbnailPath",
            tags, metadata, status, "createdAt", "updatedAt"
         ) VALUES (
            gen_random_uuid()::text, $1, $2, $3, NULL, $4,
            $5, $6, $7, $8,
            NULL, $9, $10, $11,
            $12, $13, $14, NOW(), NOW()
         )
         RETURNING id, "organizationId", "uploadedById", title, description, type,
                   "filePath", "fileSize", "mimeType", "fileHash", duration, width, height,
                   "thumbnailPath", tags, metadata, status, "createdAt", "updatedAt"`,
        [
            organizationId, uploadedById, displayTitle, mediaType,
            finalPath, file.size, file.mimetype, hash,
            width, height, thumbnailPath,
            [],   // tags: text[] — pg driver handles JS array natively
            {},   // metadata: jsonb — pg driver handles JS object natively
            initialStatus,
        ]
    );

    logger.info('Media uploaded', { mediaId: rows[0].id, type: mediaType, size: file.size });

    if (mediaType === 'VIDEO') {
        // Enqueue background transcoding (extracts metadata + thumbnail + re-encodes)
        const { enqueueVideoTranscoding } = await import('../../shared/jobs');
        await enqueueVideoTranscoding({
            mediaId: rows[0].id,
            organizationId,
            filePath: finalPath,
            mimeType: file.mimetype,
            outputDir: mediaDir,
        });
        logger.info('Video transcoding job enqueued', { mediaId: rows[0].id });
    } else {
        // Image is READY immediately — invalidate content hash now
        invalidateContentHashForOrg(organizationId).catch(() => {});
    }

    return rows[0];
}

// ─── Update metadata ──────────────────────────────────────────────────────────

export async function updateMedia(
    mediaId: string,
    organizationId: string,
    data: UpdateMediaBody
): Promise<MediaRow> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (data.title !== undefined) { fields.push(`title = $${idx++}`); values.push(data.title); }
    if (data.description !== undefined) { fields.push(`description = $${idx++}`); values.push(data.description); }
    if (data.tags !== undefined) { fields.push(`tags = $${idx++}`); values.push(data.tags); }

    if (fields.length === 0) throw new AppError(400, 'Không có dữ liệu để cập nhật');
    fields.push(`"updatedAt" = NOW()`);
    values.push(mediaId, organizationId);

    const rows = await query<MediaRow>(
        `UPDATE media SET ${fields.join(', ')}
         WHERE id = $${idx++} AND "organizationId" = $${idx++}
         RETURNING id, "organizationId", "uploadedById", title, description, type,
                   "filePath", "fileSize", "mimeType", "fileHash", duration, width, height,
                   "thumbnailPath", tags, metadata, status, "createdAt", "updatedAt"`,
        values
    );
    if (!rows[0]) throw new AppError(404, 'Media không tồn tại');
    logger.info('Media updated', { mediaId });
    return rows[0];
}

// ─── Delete ────────────────────────────────────────────────────────────────────

export async function deleteMedia(mediaId: string, organizationId: string): Promise<void> {
    const media = await queryOne<{ id: string; filePath: string; thumbnailPath: string | null }>(
        `SELECT id, "filePath", "thumbnailPath" FROM media WHERE id = $1 AND "organizationId" = $2`,
        [mediaId, organizationId]
    );
    if (!media) throw new AppError(404, 'Media không tồn tại');

    // Xoá record trước
    await query(`DELETE FROM media WHERE id = $1`, [mediaId]);

    // Xoá file vật lý
    try {
        if (fs.existsSync(media.filePath)) fs.unlinkSync(media.filePath);
        if (media.thumbnailPath && fs.existsSync(media.thumbnailPath)) {
            fs.unlinkSync(media.thumbnailPath);
        }
    } catch (e) {
        logger.warn('Could not delete media files from disk', { mediaId, error: (e as Error).message });
    }
    logger.info('Media deleted', { mediaId });
    invalidateContentHashForOrg(organizationId).catch(() => {});
}

// ─── Thumbnail ────────────────────────────────────────────────────────────────

export async function getMediaThumbnailPath(mediaId: string, organizationId: string): Promise<string> {
    const media = await queryOne<{ thumbnailPath: string | null; filePath: string; type: string }>(
        `SELECT "thumbnailPath", "filePath", type FROM media WHERE id = $1 AND "organizationId" = $2`,
        [mediaId, organizationId]
    );
    if (!media) throw new AppError(404, 'Media không tồn tại');
    if (media.type !== 'IMAGE') throw new AppError(400, 'Chỉ ảnh mới có thumbnail');
    if (!media.thumbnailPath || !fs.existsSync(media.thumbnailPath)) {
        return media.filePath;
    }
    return media.thumbnailPath;
}

// Public version — no org filter (for unauthenticated thumbnail requests from <img> tags)
export async function getMediaThumbnailPathPublic(mediaId: string): Promise<string> {
    const media = await queryOne<{ thumbnailPath: string | null; filePath: string; type: string }>(
        `SELECT "thumbnailPath", "filePath", type FROM media WHERE id = $1`,
        [mediaId]
    );
    if (!media) throw new AppError(404, 'Media không tồn tại');
    if (media.type === 'IMAGE') {
        if (media.thumbnailPath && fs.existsSync(media.thumbnailPath)) {
            return media.thumbnailPath;
        }
        return media.filePath;
    }
    if (media.thumbnailPath && fs.existsSync(media.thumbnailPath)) {
        return media.thumbnailPath;
    }
    throw new AppError(404, 'Thumbnail chưa được tạo');
}

// Public original file — for lightbox full-resolution preview
export async function getMediaFilePathPublic(mediaId: string): Promise<{ filePath: string; mimeType: string; title: string }> {
    const media = await queryOne<{ filePath: string; mimeType: string; title: string }>(
        `SELECT "filePath", "mimeType", title FROM media WHERE id = $1`,
        [mediaId]
    );
    if (!media) throw new AppError(404, 'Media không tồn tại');
    if (!fs.existsSync(media.filePath)) throw new AppError(404, 'File không tồn tại trên disk');
    return media;
}

