import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import config from '../../config';
import { AppError } from './error.middleware';

export interface JwtPayload {
    userId: string;
    organizationId: string;
    role: string;
    type: 'user' | 'device';
}

// Extend Express Request
declare global {
    namespace Express {
        interface Request {
            user?: JwtPayload;
        }
    }
}

export function authenticate(req: Request, _res: Response, next: NextFunction) {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
        return next(new AppError(401, 'Authorization token required'));
    }

    const token = authHeader.split(' ')[1];
    try {
        const payload = jwt.verify(token, config.jwt.secret) as JwtPayload;
        // Only allow user tokens on admin routes
        if (payload.type !== 'user') {
            return next(new AppError(403, 'Invalid token type'));
        }
        req.user = payload;
        next();
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
        next();
    } catch {
        return next(new AppError(401, 'Invalid or expired device token'));
    }
}

// Role-based authorization — SUPER_ADMIN bypasses all role checks
export function authorize(...roles: string[]) {
    return (req: Request, _res: Response, next: NextFunction) => {
        if (!req.user) return next(new AppError(401, 'Not authenticated'));
        if (req.user.role === 'SUPER_ADMIN') return next();
        if (!roles.includes(req.user.role)) {
            return next(new AppError(403, 'Insufficient permissions'));
        }
        next();
    };
}
