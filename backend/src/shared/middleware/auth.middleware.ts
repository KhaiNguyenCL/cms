import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import config from '../../config';
import { AppError } from './error.middleware';
import { queryOne } from '../database/db';

export interface JwtPayload {
    userId: string;
    organizationId: string;
    role: string;
    isRoot?: boolean;
    siteId?: string | null;
    type: 'user' | 'device' | 'platform_admin';
}

// Extend Express Request
declare global {
    namespace Express {
        interface Request {
            user?: JwtPayload;
        }
    }
}

export async function authenticate(req: Request, _res: Response, next: NextFunction) {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
        return next(new AppError(401, 'Authorization token required'));
    }

    const token = authHeader.split(' ')[1];
    try {
        const payload = jwt.verify(token, config.jwt.secret) as JwtPayload;
        // Allow both regular users and platform admins on admin routes
        if (payload.type !== 'user' && payload.type !== 'platform_admin') {
            return next(new AppError(403, 'Invalid token type'));
        }
        req.user = payload;

        // SUPER_ADMIN and PLATFORM_ADMIN can override org context via header
        if (payload.role === 'SUPER_ADMIN' || payload.role === 'PLATFORM_ADMIN') {
            const overrideOrgId = req.headers['x-organization-id'] as string | undefined;
            if (overrideOrgId) {
                const org = await queryOne<{ isActive: boolean }>(
                    `SELECT "isActive" FROM organizations WHERE id = $1`, [overrideOrgId]
                );
                if (!org) return next(new AppError(400, 'Target organization not found'));
                if (!org.isActive) return next(new AppError(400, 'Target organization is inactive'));
                req.user = { ...payload, organizationId: overrideOrgId };
            }
        }

        next();
    } catch {
        return next(new AppError(401, 'Invalid or expired token'));
    }
}

// Middleware for platform-admin-only routes
// Accepts: platform_admin tokens OR regular user tokens where isRoot === true
export function authenticatePlatformAdmin(req: Request, _res: Response, next: NextFunction) {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
        return next(new AppError(401, 'Authorization token required'));
    }

    const token = authHeader.split(' ')[1];
    try {
        const payload = jwt.verify(token, config.jwt.secret) as JwtPayload;
        if (payload.type === 'platform_admin') {
            req.user = payload;
            return next();
        }
        if (payload.type === 'user' && payload.isRoot === true) {
            req.user = payload;
            return next();
        }
        return next(new AppError(403, 'Insufficient privileges'));
    } catch {
        return next(new AppError(401, 'Invalid or expired token'));
    }
}

export function authenticateDevice(req: Request, _res: Response, next: NextFunction) {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
        return next(new AppError(401, 'Device token required'));
    }

    const token = authHeader.split(' ')[1];
    try {
        const payload = jwt.verify(token, config.jwt.secret) as JwtPayload;
        if (payload.type !== 'device') {
            return next(new AppError(403, 'Invalid token type'));
        }
        req.user = payload;

        // Check if device has been reset/blacklisted
        import('../cache/redis').then(({ default: redis, RedisKeys }) => {
            redis.get(RedisKeys.deviceBlacklist(payload.userId)).then(blacklisted => {
                if (blacklisted) return next(new AppError(401, 'Device token revoked — re-pairing required'));
                next();
            }).catch(() => next()); // Redis failure → allow through
        }).catch(() => next());
    } catch {
        return next(new AppError(401, 'Invalid or expired device token'));
    }
}

// Role-based authorization — SUPER_ADMIN and PLATFORM_ADMIN bypass all role checks
export function authorize(...roles: string[]) {
    return (req: Request, _res: Response, next: NextFunction) => {
        if (!req.user) return next(new AppError(401, 'Not authenticated'));
        if (req.user.role === 'SUPER_ADMIN' || req.user.role === 'PLATFORM_ADMIN') return next();
        if (!roles.includes(req.user.role)) {
            return next(new AppError(403, 'Insufficient permissions'));
        }
        next();
    };
}
