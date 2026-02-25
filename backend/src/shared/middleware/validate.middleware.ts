import { Request, Response, NextFunction } from 'express';
import { AnyZodObject, ZodError } from 'zod';
import { AppError } from './error.middleware';
import { sanitizeStrings } from '../utils/sanitize';

export function validate(schema: AnyZodObject) {
    return async (req: Request, _res: Response, next: NextFunction) => {
        try {
            const parsed = await schema.parseAsync({
                body: req.body,
                query: req.query,
                params: req.params,
            });
            // Strip HTML tags từ tất cả string fields (defense-in-depth chống XSS)
            // Áp dụng cho body (user input) và params (slugs, tên device, ...)
            // query không sanitize vì thường là số, enum, UUID
            if (parsed.body)   req.body   = sanitizeStrings(parsed.body);
            if (parsed.query)  req.query  = parsed.query as any;
            if (parsed.params) req.params = sanitizeStrings(parsed.params) as any;
            next();
        } catch (err) {
            if (err instanceof ZodError) {
                const message = err.errors.map((e) => e.message).join(', ');
                return next(new AppError(400, `Dữ liệu không hợp lệ: ${message}`));
            }
            next(err);
        }
    };
}
