import { Request, Response, NextFunction } from 'express';
import * as svc from './mail-config.service';
import { createMailConfigSchema, updateMailConfigSchema } from './mail-config.schema';
import { z } from 'zod';

export async function list(req: Request, res: Response, next: NextFunction) {
    try {
        const data = await svc.listMailConfigs();
        res.json({ success: true, data });
    } catch (err) { next(err); }
}

export async function create(req: Request, res: Response, next: NextFunction) {
    try {
        const body = createMailConfigSchema.shape.body.parse(req.body);
        const data = await svc.createMailConfig(body);
        res.status(201).json({ success: true, data });
    } catch (err) { next(err); }
}

export async function update(req: Request, res: Response, next: NextFunction) {
    try {
        const body = updateMailConfigSchema.shape.body.parse(req.body);
        const data = await svc.updateMailConfig(req.params['id'] as string, body);
        res.json({ success: true, data });
    } catch (err) { next(err); }
}

export async function remove(req: Request, res: Response, next: NextFunction) {
    try {
        await svc.deleteMailConfig(req.params['id'] as string);
        res.json({ success: true });
    } catch (err) { next(err); }
}

export async function setActive(req: Request, res: Response, next: NextFunction) {
    try {
        const data = await svc.setActiveMailConfig(req.params['id'] as string);
        res.json({ success: true, data });
    } catch (err) { next(err); }
}

export async function testMail(req: Request, res: Response, next: NextFunction) {
    try {
        const { to, configId } = z.object({
            to:       z.string().email(),
            configId: z.string().uuid().optional(),
        }).parse(req.body);
        await svc.sendTestMail(to, configId);
        res.json({ success: true, message: `Email test đã được gửi tới ${to}` });
    } catch (err) { next(err); }
}
