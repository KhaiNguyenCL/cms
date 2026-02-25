import { Router } from 'express';
import * as mediaController from './media.controller';
import { authenticate, authorize } from '../../shared/middleware/auth.middleware';
import { validate } from '../../shared/middleware/validate.middleware';
import { listMediaSchema, updateMediaSchema } from './media.schema';

const router = Router();

/**
 * @route   GET /api/media/:id/thumbnail
 * @desc    Stream thumbnail image — PUBLIC (no auth needed, img tags can't send Bearer header)
 * @access  Public
 */
router.get('/:id/thumbnail', mediaController.getThumbnail);

/**
 * @route   GET /api/media/:id/file
 * @desc    Stream original full-resolution file — PUBLIC (for lightbox preview)
 * @access  Public
 */
router.get('/:id/file', mediaController.getMediaFile);

// ── All routes below require authentication ───────────────────────────────────
router.use(authenticate);

/**
 * @route   GET /api/media
 * @desc    Danh sách media (phân trang, filter type/status/search)
 * @access  Private (ADMIN, MANAGER, VIEWER)
 */
router.get('/', validate(listMediaSchema), mediaController.listMedia);

/**
 * @route   POST /api/media/upload
 * @desc    Upload file ảnh hoặc video (multipart/form-data, field: "file")
 *          Optional body field: "title"
 * @access  Private (ADMIN, MANAGER)
 */
router.post(
    '/upload',
    authorize('ADMIN', 'MANAGER'),
    mediaController.handleUpload
);

/**
 * @route   GET /api/media/:id
 * @desc    Chi tiết media
 * @access  Private (All roles)
 */
router.get('/:id', mediaController.getMediaById);

/**
 * @route   PUT /api/media/:id
 * @desc    Cập nhật metadata (title, description, tags)
 * @access  Private (ADMIN, MANAGER)
 */
router.put(
    '/:id',
    authorize('ADMIN', 'MANAGER'),
    validate(updateMediaSchema),
    mediaController.updateMedia
);

/**
 * @route   DELETE /api/media/:id
 * @desc    Xoá media (xoá cả file vật lý)
 * @access  Private (ADMIN only)
 */
router.delete('/:id', authorize('ADMIN'), mediaController.deleteMedia);

export default router;
