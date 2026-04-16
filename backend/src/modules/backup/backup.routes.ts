import { Router } from 'express';
import { authenticate, authorize } from '../../shared/middleware/auth.middleware';
import { validate } from '../../shared/middleware/validate.middleware';
import { createBackupSchema, requestPlanSchema, resolvePlanSchema } from './backup.schema';
import * as ctrl from './backup.controller';

const router = Router();

router.use(authenticate);

// ─── Backup Plan (org-facing) — MUST come before /:id ────────────────────────
router.get('/plan',          authorize('ADMIN'), ctrl.getPlan);
router.post('/plan/request', authorize('ADMIN'), validate(requestPlanSchema), ctrl.requestPlan);

// ─── Backup Plan (super admin) — MUST come before /:id ───────────────────────
router.get('/plan/requests',              authorize('SUPER_ADMIN'), ctrl.listPlanRequests);
router.post('/plan/requests/:id/approve', authorize('SUPER_ADMIN'), validate(resolvePlanSchema), ctrl.approvePlan);
router.post('/plan/requests/:id/reject',  authorize('SUPER_ADMIN'), validate(resolvePlanSchema), ctrl.rejectPlan);

// ─── Snapshot CRUD ────────────────────────────────────────────────────────────
router.get('/',              authorize('ADMIN'), ctrl.list);
router.post('/',             authorize('ADMIN'), validate(createBackupSchema), ctrl.create);
router.delete('/:id',        authorize('ADMIN'), ctrl.remove);
router.post('/:id/restore',  authorize('ADMIN'), ctrl.restore);

export default router;
