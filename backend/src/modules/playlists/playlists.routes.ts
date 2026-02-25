import { Router } from 'express';
import * as playlistsController from './playlists.controller';
import { authenticate, authorize } from '../../shared/middleware/auth.middleware';
import { validate } from '../../shared/middleware/validate.middleware';
import {
    listPlaylistsSchema, createPlaylistSchema, updatePlaylistSchema,
    addItemSchema, updateItemSchema, reorderItemsSchema,
} from './playlists.schema';

const router = Router();
router.use(authenticate);

// ─── Playlist CRUD ─────────────────────────────────────────────────────────────

/**
 * @route   GET /api/playlists
 * @desc    Danh sách playlists (phân trang, search)
 * @access  All roles
 */
router.get('/', validate(listPlaylistsSchema), playlistsController.listPlaylists);

/**
 * @route   POST /api/playlists
 * @desc    Tạo playlist mới
 * @access  ADMIN, MANAGER
 */
router.post('/', authorize('ADMIN', 'MANAGER'), validate(createPlaylistSchema), playlistsController.createPlaylist);

/**
 * @route   GET /api/playlists/:id
 * @desc    Chi tiết playlist + toàn bộ items (kèm media info)
 * @access  All roles
 */
router.get('/:id', playlistsController.getPlaylistById);

/**
 * @route   PUT /api/playlists/:id
 * @desc    Cập nhật playlist (name, description, isDefault)
 * @access  ADMIN, MANAGER
 */
router.put('/:id', authorize('ADMIN', 'MANAGER'), validate(updatePlaylistSchema), playlistsController.updatePlaylist);

/**
 * @route   DELETE /api/playlists/:id
 * @desc    Xoá playlist (cascade xoá playlist_items)
 * @access  ADMIN only
 */
router.delete('/:id', authorize('ADMIN'), playlistsController.deletePlaylist);

// ─── Playlist Items ────────────────────────────────────────────────────────────

/**
 * @route   POST /api/playlists/:id/items
 * @desc    Thêm media vào playlist (append to end)
 * @access  ADMIN, MANAGER
 */
router.post('/:id/items', authorize('ADMIN', 'MANAGER'), validate(addItemSchema), playlistsController.addItem);

/**
 * @route   PUT /api/playlists/:id/items/reorder
 * @desc    Sắp xếp lại thứ tự items (batch update positions)
 * @access  ADMIN, MANAGER
 * NOTE: Must be BEFORE /:id/items/:itemId to avoid Express route conflict
 */
router.put('/:id/items/reorder', authorize('ADMIN', 'MANAGER'), validate(reorderItemsSchema), playlistsController.reorderItems);

/**
 * @route   PUT /api/playlists/:id/items/:itemId
 * @desc    Cập nhật item (durationOverride, transition)
 * @access  ADMIN, MANAGER
 */
router.put('/:id/items/:itemId', authorize('ADMIN', 'MANAGER'), validate(updateItemSchema), playlistsController.updateItem);

/**
 * @route   DELETE /api/playlists/:id/items/:itemId
 * @desc    Xoá item khỏi playlist (tự động re-normalize positions)
 * @access  ADMIN, MANAGER
 */
router.delete('/:id/items/:itemId', authorize('ADMIN', 'MANAGER'), playlistsController.removeItem);

export default router;
