import { Request, Response, NextFunction } from 'express';
import * as svc from './mail-template.service';
import { createTemplateSchema, updateTemplateSchema } from './mail-template.schema';
import { z } from 'zod';

// ─── Templates ────────────────────────────────────────────────────────────────

export async function listTemplates(req: Request, res: Response, next: NextFunction) {
    try {
        const data = await svc.listTemplates();
        res.json({ success: true, data });
    } catch (err) { next(err); }
}

export async function createTemplate(req: Request, res: Response, next: NextFunction) {
    try {
        const body = createTemplateSchema.shape.body.parse(req.body);
        const data = await svc.createTemplate(body);
        res.status(201).json({ success: true, data });
    } catch (err) { next(err); }
}

export async function updateTemplate(req: Request, res: Response, next: NextFunction) {
    try {
        const body = updateTemplateSchema.shape.body.parse(req.body);
        const data = await svc.updateTemplate(req.params['id'] as string, body);
        res.json({ success: true, data });
    } catch (err) { next(err); }
}

export async function deleteTemplate(req: Request, res: Response, next: NextFunction) {
    try {
        await svc.deleteTemplate(req.params['id'] as string);
        res.json({ success: true });
    } catch (err) { next(err); }
}

// ─── Mail Settings ────────────────────────────────────────────────────────────

export async function listSettings(req: Request, res: Response, next: NextFunction) {
    try {
        const [settings, eventTypes] = await Promise.all([
            svc.listMailSettings(),
            Promise.resolve(svc.EVENT_TYPES),
        ]);
        res.json({ success: true, data: settings, eventTypes });
    } catch (err) { next(err); }
}

export async function updateSetting(req: Request, res: Response, next: NextFunction) {
    try {
        const body = z.object({
            templateId:      z.string().uuid().nullable().optional(),
            mailConfigId:    z.string().uuid().nullable().optional(),
            isEnabled:       z.boolean().optional(),
            triggerDelayMin: z.number().int().min(0).max(60).optional(),
            cooldownHours:   z.number().int().min(0).max(168).optional(),
            advanceDays:     z.number().int().min(1).max(365).optional(),
        }).parse(req.body);
        const data = await svc.updateMailSetting(req.params['eventType'] as string, body);
        res.json({ success: true, data });
    } catch (err) { next(err); }
}
