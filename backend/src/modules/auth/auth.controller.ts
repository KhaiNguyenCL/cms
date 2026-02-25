import { Request, Response, NextFunction } from 'express';
import * as authService from './auth.service';
import { AppError } from '../../shared/middleware/error.middleware';
import { forgotPasswordSchema, resetPasswordSchema } from './auth.schema';

// ─── Cookie helpers ───────────────────────────────────────────────────────────

const REFRESH_COOKIE = 'cms_rt';
const COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 ngày

function setRefreshCookie(res: Response, token: string) {
    res.cookie(REFRESH_COOKIE, token, {
        httpOnly: true,                                            // không đọc được từ JS
        secure: process.env.NODE_ENV === 'production',            // chỉ HTTPS trên production
        sameSite: 'strict',                                       // chặn CSRF
        maxAge: COOKIE_MAX_AGE_MS,
        path: '/api/auth',                                        // chỉ gửi tới /api/auth/*
    });
}

function clearRefreshCookie(res: Response) {
    res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
}

// ─── Endpoints ────────────────────────────────────────────────────────────────

// POST /api/auth/register
export async function register(req: Request, res: Response, next: NextFunction) {
    try {
        const { accessToken, refreshToken, user } = await authService.register(req.body);
        setRefreshCookie(res, refreshToken);
        res.status(201).json({
            success: true,
            message: 'Đăng ký thành công',
            data: { accessToken, user },
        });
    } catch (err) {
        next(err);
    }
}

// POST /api/auth/login
export async function login(req: Request, res: Response, next: NextFunction) {
    try {
        const ip = req.ip || req.socket.remoteAddress || 'unknown';
        const { accessToken, refreshToken, user } = await authService.login(req.body, ip);
        setRefreshCookie(res, refreshToken);
        res.json({
            success: true,
            message: 'Đăng nhập thành công',
            data: { accessToken, user },
        });
    } catch (err) {
        next(err);
    }
}

// POST /api/auth/logout
export async function logout(req: Request, res: Response, next: NextFunction) {
    try {
        const token = req.cookies?.[REFRESH_COOKIE];
        if (token) {
            await authService.logout(token, req.user!.userId);
        }
        clearRefreshCookie(res);
        res.json({ success: true, message: 'Đăng xuất thành công' });
    } catch (err) {
        next(err);
    }
}

// POST /api/auth/refresh-token
// Refresh token được đọc từ HttpOnly cookie, không nhận từ body
export async function refreshToken(req: Request, res: Response, next: NextFunction) {
    try {
        const token = req.cookies?.[REFRESH_COOKIE];
        if (!token) throw new AppError(401, 'Không tìm thấy refresh token');
        const { accessToken, refreshToken: newRefreshToken, user } = await authService.refreshAccessToken(token);
        setRefreshCookie(res, newRefreshToken);
        res.json({ success: true, data: { accessToken, user } });
    } catch (err) {
        next(err);
    }
}

// GET /api/auth/me
export async function me(req: Request, res: Response, next: NextFunction) {
    try {
        res.json({ success: true, data: req.user });
    } catch (err) {
        next(err);
    }
}

// POST /api/auth/pairing-code
export async function getPairingCode(req: Request, res: Response, next: NextFunction) {
    try {
        const code = await authService.generatePairingCode(req.user!.organizationId);
        res.json({
            success: true,
            data: { code, expiresInSeconds: 300 },
        });
    } catch (err) {
        next(err);
    }
}

// POST /api/auth/pair-device
export async function pairDevice(req: Request, res: Response, next: NextFunction) {
    try {
        const { pairingCode, name, androidId, model, osVersion, appVersion } = req.body;
        if (!pairingCode) throw new AppError(400, 'pairingCode là bắt buộc');
        if (!name) throw new AppError(400, 'name là bắt buộc');

        const result = await authService.pairDevice(pairingCode, {
            name,
            androidId,
            model,
            osVersion,
            appVersion,
        });

        res.status(201).json({
            success: true,
            message: 'Device đã được pair thành công',
            data: result,
        });
    } catch (err) {
        next(err);
    }
}

// POST /api/auth/forgot-password
export async function forgotPassword(req: Request, res: Response, next: NextFunction) {
    try {
        const parsed = forgotPasswordSchema.shape.body.parse(req.body);
        const result = await authService.forgotPassword(parsed.email);
        res.json({ success: true, ...result });
    } catch (err) {
        next(err);
    }
}

// POST /api/auth/reset-password
export async function resetPassword(req: Request, res: Response, next: NextFunction) {
    try {
        const parsed = resetPasswordSchema.shape.body.parse(req.body);
        const result = await authService.resetPassword(parsed.token, parsed.password);
        res.json({ success: true, ...result });
    } catch (err) {
        next(err);
    }
}
