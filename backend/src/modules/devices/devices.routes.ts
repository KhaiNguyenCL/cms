import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as devController from './devices.controller';
import { authenticate, authorize } from '../../shared/middleware/auth.middleware';
import { validate } from '../../shared/middleware/validate.middleware';

// Max 10 commands per device per minute per IP — prevents command spam
const commandRateLimit = rateLimit({
    windowMs: 60_000,
    max: 10,
    keyGenerator: (req) => `${req.ip}:${req.params.id}`,
    message: { error: 'Quá nhiều lệnh được gửi. Vui lòng thử lại sau.' },
    standardHeaders: true,
    legacyHeaders: false,
});
import {
    listDevicesSchema, updateDeviceSchema,
    deviceCommandSchema, createGroupSchema, updateGroupSchema, createDeviceSchema,
    registerDeviceSchema, generatePairingCodeSchema, devicePairSchema,
    reconnectDeviceSchema, refreshDeviceTokenSchema, batchGeneratePairingCodesSchema,
} from './devices.schema';

const router = Router();

// ─── DEVICE PAIRING ENDPOINTS (3-STEP FLOW) ───────────────────────────────────

/**
 * @route   POST /api/devices/register
 * @desc    STEP 1: Admin registers device profile (REGISTERED status)
 * @access  Private (ADMIN only)
 */
router.post(
    '/register',
    authenticate,
    authorize('ADMIN'),
    validate(registerDeviceSchema),
    devController.registerDevice
);

/**
 * @route   POST /api/devices/:deviceId/generate-pairing-code
 * @desc    STEP 2: Admin generates 6-digit pairing code + QR code (5 min TTL)
 * @access  Private (ADMIN only)
 */
router.post(
    '/:deviceId/generate-pairing-code',
    authenticate,
    authorize('ADMIN'),
    validate(generatePairingCodeSchema),
    devController.generatePairingCode
);

/**
 * @route   POST /api/devices/pair
 * @desc    STEP 3: Device pairs with code + device signature (HMAC verification)
 * @access  Public - Device only (no user auth)
 */
router.post(
    '/pair',
    validate(devicePairSchema),
    devController.pairDevice
);

/**
 * @route   POST /api/devices/reconnect
 * @desc    Device reconnects after app reinstall using hwId (no pairing code)
 *          Returns 404 if device never paired → show pairing form on Android
 * @access  Public - Device only
 */
router.post(
    '/reconnect',
    validate(reconnectDeviceSchema),
    devController.reconnectDevice
);

/**
 * @route   POST /api/devices/refresh-token
 * @desc    Device refreshes JWT token before expiry (60 days)
 * @access  Private (Device auth via deviceToken)
 */
router.post(
    '/refresh-token',
    authenticate,
    validate(refreshDeviceTokenSchema),
    devController.refreshDeviceToken
);

/**
 * @route   POST /api/devices/batch-generate-pairing-codes
 * @desc    Batch generate pairing codes for multiple devices (up to 100)
 * @access  Private (ADMIN only)
 */
router.post(
    '/batch-generate-pairing-codes',
    authenticate,
    authorize('ADMIN'),
    validate(batchGeneratePairingCodesSchema),
    devController.batchGeneratePairingCodes
);

// ─── STANDARD DEVICE ENDPOINTS ─────────────────────────────────────────────────

router.use(authenticate);

/**
 * @route   GET /api/devices
 * @desc    Danh sách devices (phân trang, filter status/search)
 * @access  Private (ADMIN, MANAGER)
 */
router.get('/', authorize('ADMIN', 'MANAGER', 'VIEWER', 'SITE_MANAGER', 'CONTENT_MANAGER'), validate(listDevicesSchema), devController.listDevices);

/**
 * @route   POST /api/devices
 * @desc    Tạo device mới với pairingCode tự động (legacy - use /register instead)
 * @access  Private (ADMIN only)
 */
router.post('/', authorize('ADMIN'), validate(createDeviceSchema), devController.createDevice);

/**
 * @route   GET /api/devices/:id
 * @desc    Chi tiết device
 * @access  Private (ADMIN, MANAGER)
 */
router.get('/:id', authorize('ADMIN', 'MANAGER', 'VIEWER', 'SITE_MANAGER'), devController.getDeviceById);

/**
 * @route   PUT/PATCH /api/devices/:id
 * @desc    Cập nhật device (tên, location, timezone, status, settings, license dates)
 * @access  Private (ADMIN, MANAGER)
 */
router.put('/:id',   authorize('ADMIN', 'MANAGER', 'SITE_MANAGER'), validate(updateDeviceSchema), devController.updateDevice);
router.patch('/:id', authorize('ADMIN', 'MANAGER', 'SITE_MANAGER'), validate(updateDeviceSchema), devController.updateDevice);

/**
 * @route   DELETE /api/devices/:id
 * @desc    Xoá/Revoke device (blacklist token)
 * @access  Private (ADMIN only)
 */
router.delete('/:id', authorize('ADMIN'), devController.deleteDevice);

/**
 * @route   POST /api/devices/:id/reset
 * @desc    Revoke device token + reset to REGISTERED (forces re-pairing)
 * @access  Private (ADMIN only)
 */
router.post('/:id/reset', authorize('ADMIN'), devController.resetDevice);

/**
 * @route   POST /api/devices/:id/command
 * @desc    Gửi lệnh tới device (RESTART, SCREENSHOT, RELOAD_CONTENT, CLEAR_CACHE)
 * @access  Private (ADMIN, MANAGER)
 */
router.post('/:id/command', commandRateLimit, authorize('ADMIN', 'MANAGER', 'SITE_MANAGER'), validate(deviceCommandSchema), devController.sendCommand);

/**
 * @route   GET /api/devices/:id/screenshot
 * @desc    Trigger chụp màn hình device
 * @access  Private (ADMIN, MANAGER)
 */
router.get('/:id/screenshot', authorize('ADMIN', 'MANAGER', 'SITE_MANAGER'), devController.getScreenshot);

/**
 * @route   GET /api/devices/:id/logs
 * @desc    Xem logs của device
 * @access  Private (ADMIN, MANAGER)
 */
router.get('/:id/logs', authorize('ADMIN', 'MANAGER', 'VIEWER', 'SITE_MANAGER'), devController.getDeviceLogs);

/**
 * @route   GET /api/devices/:id/health
 * @desc    Lấy thông tin sức khỏe thiết bị mới nhất (CPU, RAM, Storage, Network)
 * @access  Private (ADMIN, MANAGER)
 */
router.get('/:id/health', authorize('ADMIN', 'MANAGER', 'VIEWER', 'SITE_MANAGER'), devController.getDeviceHealth);


/**
 * @route   PATCH /api/devices/:id/license
 * @desc    Toggle isLicensed cho device (đăng ký/hủy license)
 * @access  Private (ADMIN only)
 */
router.patch('/:id/license', authorize('ADMIN'), devController.setDeviceLicense);

/**
 * @route   GET /api/devices/:id/now-playing
 * @desc    Lấy media đang phát gần nhất từ playback_logs
 * @access  Private (ADMIN, MANAGER)
 */
router.get('/:id/now-playing', authorize('ADMIN', 'MANAGER', 'VIEWER', 'SITE_MANAGER'), devController.getNowPlaying);
router.get('/:id/active-schedules', authorize('ADMIN', 'MANAGER', 'VIEWER', 'SITE_MANAGER'), devController.getActiveSchedules);

/**
 * @route   GET /api/devices/:id/comments
 * @desc    Danh sách ghi chú của device
 * @access  Private (ADMIN, MANAGER)
 */
router.get('/:id/comments', authorize('ADMIN', 'MANAGER', 'VIEWER', 'SITE_MANAGER'), devController.getDeviceComments);

/**
 * @route   POST /api/devices/:id/comments
 * @desc    Thêm ghi chú cho device
 * @access  Private (ADMIN)
 */
router.post('/:id/comments', authorize('ADMIN', 'SITE_MANAGER'), devController.addDeviceComment);

// ─── Device group endpoints ────────────────────────────────────────────────────

/**
 * @route   GET /api/device-groups
 * @desc    Danh sách device groups
 * @access  Private (ADMIN, MANAGER)
 */
router.get('/groups/list', authorize('ADMIN', 'MANAGER', 'VIEWER', 'SITE_MANAGER', 'CONTENT_MANAGER'), devController.listGroups);

/**
 * @route   POST /api/device-groups
 * @desc    Tạo device group mới
 * @access  Private (ADMIN only)
 */
router.post('/groups', authorize('ADMIN'), validate(createGroupSchema), devController.createGroup);

/**
 * @route   PUT /api/device-groups/:id
 * @desc    Cập nhật device group
 * @access  Private (ADMIN only)
 */
router.put('/groups/:id', authorize('ADMIN'), validate(updateGroupSchema), devController.updateGroup);

export default router;
