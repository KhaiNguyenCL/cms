import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as authController from './auth.controller';
import { authenticate, authorize } from '../../shared/middleware/auth.middleware';
import { validate } from '../../shared/middleware/validate.middleware';
import {
    registerSchema,
    loginSchema,
    forgotPasswordSchema,
    resetPasswordSchema,
} from './auth.schema';

const router = Router();

// Rate limiter nghiêm ngặt cho auth endpoints (5 req/phút/IP)
const authLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 5,
    message: { success: false, message: 'Quá nhiều request, thử lại sau 1 phút' },
    standardHeaders: true,
    legacyHeaders: false,
});

// ─── Public routes (không cần token) ─────────────────────────────────────────

/**
 * @route   POST /api/auth/register
 * @desc    Đăng ký organization mới + tạo admin user đầu tiên
 * @access  Public
 */
router.post('/register', authLimiter, validate(registerSchema), authController.register);

/**
 * @route   POST /api/auth/login
 * @desc    Đăng nhập, trả về access + refresh token
 * @access  Public
 */
router.post('/login', authLimiter, validate(loginSchema), authController.login);

/**
 * @route   POST /api/auth/refresh-token
 * @desc    Lấy access token mới (token rotation)
 * @access  Public (dùng refresh token)
 */
router.post('/refresh-token', authController.refreshToken);

/**
 * @route   POST /api/auth/pair-device
 * @desc    Android TV gọi để pair device (dùng pairing code)
 * @access  Public (dùng pairing code thay token)
 */
router.post('/pair-device', authLimiter, authController.pairDevice);

/**
 * @route   POST /api/auth/forgot-password
 * @desc    Gửi link đặt lại mật khẩu về email
 * @access  Public
 */
router.post('/forgot-password', authLimiter, validate(forgotPasswordSchema), authController.forgotPassword);

/**
 * @route   POST /api/auth/reset-password
 * @desc    Đặt lại mật khẩu với reset token
 * @access  Public
 */
router.post('/reset-password', authLimiter, validate(resetPasswordSchema), authController.resetPassword);

// ─── Protected routes (cần access token) ─────────────────────────────────────

/**
 * @route   GET  /api/auth/me
 * @desc    Lấy thông tin user đang đăng nhập
 * @access  Private
 */
router.get('/me', authenticate, authController.me);

/**
 * @route   POST /api/auth/logout
 * @desc    Đăng xuất, thu hồi refresh token
 * @access  Private
 */
router.post('/logout', authenticate, authController.logout);

/**
 * @route   POST /api/auth/pairing-code
 * @desc    Admin tạo pairing code 6 số để pair Android TV
 * @access  Private (ADMIN, MANAGER)
 */
router.post('/pairing-code', authenticate, authorize('ADMIN', 'MANAGER'), authController.getPairingCode);

export default router;
