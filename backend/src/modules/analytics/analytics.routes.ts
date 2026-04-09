import { Router } from 'express';
import * as analyticsController from './analytics.controller';
import { authenticate, authorize } from '../../shared/middleware/auth.middleware';
import { validate } from '../../shared/middleware/validate.middleware';
import { overviewSchema, playbackStatsSchema, deviceHealthSchema, topContentSchema } from './analytics.schema';

const router = Router();
router.use(authenticate);

/**
 * @route   GET /api/analytics/overview
 * @desc    Dashboard tổng quan: devices, users, media, playlists, schedules, playback, storage
 *          Query params: from?, to? (YYYY-MM-DD) — giới hạn period cho playback stats
 * @access  All roles
 */
router.get('/overview', validate(overviewSchema), analyticsController.getOverview);

/**
 * @route   GET /api/analytics/playback
 * @desc    Thống kê playback theo thời gian (time-series)
 *          Params: from?, to?, deviceId?, mediaId?, groupBy: day|week|month
 * @access  All roles
 */
router.get('/playback', validate(playbackStatsSchema), analyticsController.getPlayback);

/**
 * @route   GET /api/analytics/top-content
 * @desc    Top N nội dung được phát nhiều nhất
 *          Params: from?, to?, limit (default 10)
 * @access  All roles
 */
router.get('/top-content', validate(topContentSchema), analyticsController.getTopContent);

/**
 * @route   GET /api/analytics/device-health
 * @desc    Thống kê sức khoẻ thiết bị (CPU, RAM, Storage%, Network)
 *          Params: deviceId? (filter 1 device), limit (default 50)
 * @access  ADMIN, MANAGER
 */
router.get('/device-health', authorize('ADMIN', 'MANAGER'), validate(deviceHealthSchema), analyticsController.getDeviceHealth);

/**
 * @route   GET /api/analytics/device-charts
 * @desc    Dữ liệu biểu đồ tròn: trạng thái, lịch phát, model, version
 * @access  All roles
 */
router.get('/device-charts', analyticsController.getDeviceCharts);

/**
 * @route   GET /api/analytics/device-activity
 * @desc    Hoạt động phát nội dung theo device (plays count, total minutes, last played)
 *          Params: from?, to?, limit (default 20)
 * @access  ADMIN, MANAGER
 */
router.get('/device-activity', authorize('ADMIN', 'MANAGER'), analyticsController.getDeviceActivity);
router.get('/top-playlists',    analyticsController.getTopPlaylists);
router.get('/top-schedules',    analyticsController.getTopSchedules);
router.get('/creation-stats',   analyticsController.getCreationStats);

export default router;
