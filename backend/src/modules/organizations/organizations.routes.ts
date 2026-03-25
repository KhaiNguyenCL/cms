import { Router } from 'express';
import * as orgController from './organizations.controller';
import { authenticate, authorize } from '../../shared/middleware/auth.middleware';
import { validate } from '../../shared/middleware/validate.middleware';
import { updateOrganizationSchema, addPointsSchema, updateDevicePinSchema } from './organizations.schema';

const router = Router();

// Tất cả organizations routes đều cần auth
router.use(authenticate);

/**
 * @route   GET /api/organizations/me
 * @desc    Lấy thông tin organization của user đang đăng nhập
 * @access  Private (mọi role)
 */
router.get('/me', orgController.getMyOrganization);

/**
 * @route   PUT /api/organizations/me
 * @desc    Cập nhật thông tin organization (tên, logo, timezone, settings)
 * @access  Private (ADMIN only)
 */
router.put(
    '/me',
    authorize('ADMIN'),
    validate(updateOrganizationSchema),
    orgController.updateMyOrganization
);

/**
 * @route   GET /api/organizations/me/stats
 * @desc    Lấy thống kê tổng quan: users, devices, media, playlists, schedules
 * @access  Private (ADMIN, MANAGER)
 */
router.get('/me/stats', authorize('ADMIN', 'MANAGER'), orgController.getOrganizationStats);


/**
 * @route   PATCH /api/organizations/me/device-pin
 * @desc    Cập nhật PIN admin cho thiết bị (4–8 chữ số)
 * @access  Private (ADMIN only)
 */
router.patch(
    '/me/device-pin',
    authorize('ADMIN'),
    validate(updateDevicePinSchema),
    orgController.updateDevicePin
);

/**
 * @route   GET /api/organizations/me/license
 * @desc    Lấy thông tin license hiện tại + 30 giao dịch gần nhất
 * @access  Private (ADMIN, MANAGER)
 */
router.get('/me/license', authorize('ADMIN', 'MANAGER'), orgController.getMyLicenseInfo);

/**
 * @route   GET /api/organizations/all
 * @desc    Liệt kê tất cả organizations (kèm stats)
 * @access  SUPER_ADMIN only
 */
router.get('/all', authorize('SUPER_ADMIN'), orgController.listAllOrganizations);

/**
 * @route   PATCH /api/organizations/:id/status
 * @desc    Bật/tắt trạng thái hoạt động của organization
 * @access  SUPER_ADMIN only
 */
router.patch('/:id/status', authorize('SUPER_ADMIN'), orgController.setOrganizationStatus);

/**
 * @route   DELETE /api/organizations/:id
 * @desc    Xóa vĩnh viễn tổ chức và toàn bộ dữ liệu liên quan
 * @access  SUPER_ADMIN only
 */
router.delete('/:id', authorize('SUPER_ADMIN'), orgController.deleteOrganization);


/**
 * @route   GET /api/organizations/:id/license
 * @desc    Lấy thông tin license của bất kỳ org
 * @access  SUPER_ADMIN only
 */
router.get('/:id/license', authorize('SUPER_ADMIN'), orgController.getOrgLicenseInfo);

/**
 * @route   POST /api/organizations/:id/license/add-points
 * @desc    Thêm points vào org (PURCHASE hoặc ADJUSTMENT)
 * @access  SUPER_ADMIN only
 */
router.post(
    '/:id/license/add-points',
    authorize('SUPER_ADMIN'),
    validate(addPointsSchema),
    orgController.addPoints
);

export default router;
