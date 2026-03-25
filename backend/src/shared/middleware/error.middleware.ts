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

/**
 * Re-throws `err` unless it is a PostgreSQL unique-violation (code 23505),
 * in which case it throws AppError(409) with the given message.
 * Use in service create/update functions that have a DB unique constraint.
 */
export function handleUniqueViolation(err: unknown, message: string): never {
    if ((err as { code?: string })?.code === '23505') {
        throw new AppError(409, message);
    }
    throw err;
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
