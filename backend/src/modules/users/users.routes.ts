import { Router } from 'express';
import * as usersController from './users.controller';
import { authenticate, authorize } from '../../shared/middleware/auth.middleware';
import { validate } from '../../shared/middleware/validate.middleware';
import { createUserSchema, updateUserSchema, listUsersSchema } from './users.schema';

const router = Router();

// Tất cả routes đều cần auth
router.use(authenticate);

/**
 * @route   GET /api/users
 * @desc    Danh sách users trong organization (có phân trang, filter, search)
 * @access  Private (ADMIN, MANAGER)
 */
router.get(
    '/',
    authorize('ADMIN', 'MANAGER'),
    validate(listUsersSchema),
    usersController.listUsers
);

/**
 * @route   POST /api/users
 * @desc    Tạo user mới trong organization
 * @access  Private (ADMIN only)
 */
router.post(
    '/',
    authorize('ADMIN'),
    validate(createUserSchema),
    usersController.createUser
);

/**
 * @route   GET /api/users/:id
 * @desc    Lấy chi tiết một user
 * @access  Private (ADMIN, MANAGER)
 */
router.get(
    '/:id',
    authorize('ADMIN', 'MANAGER'),
    usersController.getUserById
);

/**
 * @route   PUT /api/users/:id
 * @desc    Cập nhật role hoặc status của user
 * @access  Private (ADMIN only)
 */
router.put(
    '/:id',
    authorize('ADMIN'),
    validate(updateUserSchema),
    usersController.updateUser
);

/**
 * @route   DELETE /api/users/:id
 * @desc    Soft delete user (đổi status → INACTIVE)
 * @access  Private (ADMIN only)
 */
router.delete(
    '/:id',
    authorize('ADMIN'),
    usersController.deleteUser
);

export default router;
