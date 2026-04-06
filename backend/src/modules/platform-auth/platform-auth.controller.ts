import { Request, Response, NextFunction } from 'express';
import * as svc from './platform-auth.service';
import { AppError } from '../../shared/middleware/error.middleware';

const COOKIE_NAME = 'pa_refresh_token';

const cookieOpts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    path: '/api/platform',
};

export async function login(req: Request, res: Response, next: NextFunction) {
    try {
        const { email, password } = req.body as { email: string; password: string };
        if (!email || !password) return next(new AppError(400, 'Email và mật khẩu là bắt buộc'));
        const result = await svc.loginPlatformAdmin(email, password);
        res.cookie(COOKIE_NAME, result.refreshToken, cookieOpts);
        res.json({ success: true, data: { accessToken: result.accessToken, admin: result.admin } });
    } catch (err) { next(err); }
}

export async function refresh(req: Request, res: Response, next: NextFunction) {
    try {
        const token = req.cookies?.[COOKIE_NAME];
        if (!token) return next(new AppError(401, 'No refresh token'));
        const result = await svc.refreshPlatformToken(token);
        res.cookie(COOKIE_NAME, result.refreshToken, cookieOpts);
        res.json({ success: true, data: { accessToken: result.accessToken, admin: result.admin } });
    } catch (err) { next(err); }
}

export async function logout(req: Request, res: Response, next: NextFunction) {
    try {
        const token = req.cookies?.[COOKIE_NAME];
        if (token) await svc.logoutPlatformAdmin(token);
        res.clearCookie(COOKIE_NAME, { path: '/api/platform' });
        res.json({ success: true, message: 'Đã đăng xuất' });
    } catch (err) { next(err); }
}

export async function getMe(req: Request, res: Response, next: NextFunction) {
    try {
        const admins = await svc.listPlatformAdmins();
        const me = admins.find(a => a.id === req.user!.userId) ?? null;
        res.json({ success: true, data: me });
    } catch (err) { next(err); }
}

export async function listAdmins(_req: Request, res: Response, next: NextFunction) {
    try {
        const admins = await svc.listPlatformAdmins();
        res.json({ success: true, data: admins });
    } catch (err) { next(err); }
}

export async function createAdmin(req: Request, res: Response, next: NextFunction) {
    try {
        const { email, password, name } = req.body as { email: string; password: string; name: string };
        if (!email || !password || !name) return next(new AppError(400, 'Email, mật khẩu và tên là bắt buộc'));
        const admin = await svc.createPlatformAdmin(email, password, name);
        res.status(201).json({ success: true, data: admin });
    } catch (err) { next(err); }
}

export async function updateAdmin(req: Request, res: Response, next: NextFunction) {
    try {
        const admin = await svc.updatePlatformAdmin(req.params.id as string, req.body, req.user!.userId);
        res.json({ success: true, data: admin });
    } catch (err) { next(err); }
}

export async function deleteAdmin(req: Request, res: Response, next: NextFunction) {
    try {
        await svc.deletePlatformAdmin(req.params.id as string, req.user!.userId);
        res.json({ success: true, message: 'Đã xóa platform admin' });
    } catch (err) { next(err); }
}
