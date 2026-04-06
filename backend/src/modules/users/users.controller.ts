import { Request, Response, NextFunction } from 'express';
import * as userService from './users.service';
import { listUsersSchema } from './users.schema';
import { logAction } from '../action-history/action-history.service';

// GET /api/users
export async function listUsers(req: Request, res: Response, next: NextFunction) {
    try {
        // Parse và coerce query params (page/limit đến dạng string từ URL)
        const parsed = listUsersSchema.shape.query.parse(req.query);
        const result = await userService.listUsers(req.user!.organizationId, parsed);
        res.json({ success: true, ...result });
    } catch (err) {
        next(err);
    }
}

// POST /api/users
export async function createUser(req: Request, res: Response, next: NextFunction) {
    try {
        const user = await userService.createUser(
            req.user!.organizationId,
            req.user!.userId,
            req.body
        );
        logAction(req.user!.organizationId, req.user!.userId, 'CREATE', 'USER', user.id, user.email).catch(() => {});
        res.status(201).json({
            success: true,
            message: 'Tạo user thành công',
            data: user,
        });
    } catch (err) {
        next(err);
    }
}

// GET /api/users/:id
export async function getUserById(req: Request, res: Response, next: NextFunction) {
    try {
        const user = await userService.getUserById(req.params.id as string, req.user!.organizationId);
        res.json({ success: true, data: user });
    } catch (err) {
        next(err);
    }
}

// PUT /api/users/:id
export async function updateUser(req: Request, res: Response, next: NextFunction) {
    try {
        const user = await userService.updateUser(
            req.params.id as string,
            req.user!.organizationId,
            req.user!.userId,
            req.body
        );
        logAction(req.user!.organizationId, req.user!.userId, 'UPDATE', 'USER', user.id, user.email).catch(() => {});
        res.json({
            success: true,
            message: 'Cập nhật user thành công',
            data: user,
        });
    } catch (err) {
        next(err);
    }
}

// DELETE /api/users/:id
export async function deleteUser(req: Request, res: Response, next: NextFunction) {
    try {
        const { email } = await userService.deleteUser(
            req.params.id as string,
            req.user!.organizationId,
            req.user!.userId
        );
        logAction(req.user!.organizationId, req.user!.userId, 'DELETE', 'USER', req.params.id as string, email).catch(() => {});
        res.json({ success: true, message: 'User đã bị vô hiệu hoá' });
    } catch (err) {
        next(err);
    }
}
