import { Router } from 'express';
import * as schedulesController from './schedules.controller';
import { authenticate, authorize } from '../../shared/middleware/auth.middleware';
import { validate } from '../../shared/middleware/validate.middleware';
import { listSchedulesSchema, createScheduleSchema, updateScheduleSchema } from './schedules.schema';

const router = Router();
router.use(authenticate);

/**
 * @route   GET /api/schedules
 * @desc    Danh sách schedules (phân trang, filter isActive/targetType/search)
 * @access  All roles
 */
router.get('/', validate(listSchedulesSchema), schedulesController.listSchedules);

/**
 * @route   POST /api/schedules
 * @desc    Tạo schedule mới
 *          targetType=DEVICE → targetDeviceId bắt buộc
 *          targetType=GROUP  → targetGroupId bắt buộc
 *          daysOfWeek: [0..6], 0=Sun. Empty array = every day.
 * @access  ADMIN, MANAGER
 */
router.post('/', authorize('ADMIN', 'MANAGER'), validate(createScheduleSchema), schedulesController.createSchedule);

/**
 * @route   GET /api/schedules/:id
 * @desc    Chi tiết schedule (kèm playlistName, targetDeviceName, targetGroupName)
 * @access  All roles
 */
router.get('/:id', schedulesController.getScheduleById);

/**
 * @route   PUT /api/schedules/:id
 * @desc    Cập nhật schedule
 * @access  ADMIN, MANAGER
 */
router.put('/:id', authorize('ADMIN', 'MANAGER'), validate(updateScheduleSchema), schedulesController.updateSchedule);

/**
 * @route   DELETE /api/schedules/:id
 * @desc    Xoá schedule
 * @access  ADMIN only
 */
router.delete('/:id', authorize('ADMIN'), schedulesController.deleteSchedule);

export default router;
