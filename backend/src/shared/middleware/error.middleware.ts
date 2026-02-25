import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';
import config from '../../config';

export class AppError extends Error {
    constructor(
        public statusCode: number,
        message: string,
        public isOperational = true
    ) {
        super(message);
        Object.setPrototypeOf(this, AppError.prototype);
    }
}

export function errorHandler(
    err: Error,
    _req: Request,
    res: Response,
    _next: NextFunction
) {
    if (err instanceof AppError) {
        return res.status(err.statusCode).json({ error: err.message });
    }

    // Unexpected error - don't leak stack in production
    logger.error('Unexpected error', { error: err.message, stack: err.stack });

    return res.status(500).json({
        error: config.env === 'production'
            ? 'Internal server error'
            : err.message,
    });
}
