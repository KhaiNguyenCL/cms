import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { Request } from 'express';
import { AppError } from '../../shared/middleware/error.middleware';

// Ensure upload directories exist
const tempDir = process.env.UPLOAD_TEMP_DIR || 'E:/Script/cms/storage/temp';
const mediaDir = process.env.MEDIA_DIR || 'E:/Script/cms/storage/media';
const thumbDir = process.env.THUMBNAIL_DIR || 'E:/Script/cms/storage/thumbnails';

[tempDir, mediaDir, thumbDir].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const ALLOWED_MIMES = new Set([
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'video/mp4', 'video/webm', 'video/quicktime',
]);

const MAX_IMAGE_BYTES = (parseInt(process.env.MAX_IMAGE_SIZE_MB || '50')) * 1024 * 1024;
const MAX_VIDEO_BYTES = (parseInt(process.env.MAX_VIDEO_SIZE_MB || '2048')) * 1024 * 1024;

// ── Multer disk storage ─────────────────────────────────────────────────────

const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, tempDir),
    filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, `${uuidv4()}${ext}`);
    },
});

function fileFilter(
    _req: Request,
    file: Express.Multer.File,
    cb: multer.FileFilterCallback
) {
    if (ALLOWED_MIMES.has(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new AppError(415, `Định dạng file không được hỗ trợ: ${file.mimetype}`) as any);
    }
}

export const uploadMiddleware = multer({
    storage,
    fileFilter,
    limits: { fileSize: MAX_VIDEO_BYTES }, // sử dụng limit video (lớn hơn)
}).single('file');

export { tempDir, mediaDir, thumbDir, MAX_IMAGE_BYTES, MAX_VIDEO_BYTES };
