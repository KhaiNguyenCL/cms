import { Router } from 'express';
import { authenticate, authorize } from '../../shared/middleware/auth.middleware';
import { validate } from '../../shared/middleware/validate.middleware';
import * as mailConfigCtrl from './mail-config.controller';
import * as mailTemplateCtrl from './mail-template.controller';
import { createMailConfigSchema, updateMailConfigSchema } from './mail-config.schema';
import { createTemplateSchema, updateTemplateSchema } from './mail-template.schema';

const router = Router();

// All platform routes require SUPER_ADMIN
router.use(authenticate, authorize('SUPER_ADMIN'));

// ── Mail Configs ──────────────────────────────────────────────────────────────
router.get   ('/mail-configs',              mailConfigCtrl.list);
router.post  ('/mail-configs',              validate(createMailConfigSchema), mailConfigCtrl.create);
router.post  ('/mail-configs/test',         mailConfigCtrl.testMail);
router.put   ('/mail-configs/:id',          validate(updateMailConfigSchema), mailConfigCtrl.update);
router.delete('/mail-configs/:id',          mailConfigCtrl.remove);
router.post  ('/mail-configs/:id/activate', mailConfigCtrl.setActive);

// ── Mail Templates ────────────────────────────────────────────────────────────
router.get   ('/mail-templates',     mailTemplateCtrl.listTemplates);
router.post  ('/mail-templates',     validate(createTemplateSchema), mailTemplateCtrl.createTemplate);
router.put   ('/mail-templates/:id', validate(updateTemplateSchema), mailTemplateCtrl.updateTemplate);
router.delete('/mail-templates/:id', mailTemplateCtrl.deleteTemplate);

// ── Mail Settings ─────────────────────────────────────────────────────────────
router.get('/mail-settings',              mailTemplateCtrl.listSettings);
router.put('/mail-settings/:eventType',   mailTemplateCtrl.updateSetting);

export default router;
