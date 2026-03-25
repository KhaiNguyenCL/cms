import { Router } from 'express';
import { authenticate, authorize } from '../../shared/middleware/auth.middleware';
import * as ctrl from './schedule-assignments.controller';

const router = Router();

router.use(authenticate);

router.get('/',            authorize('ADMIN', 'MANAGER', 'VIEWER'), ctrl.list);
router.post('/bulk',       authorize('ADMIN', 'MANAGER'),           ctrl.bulkAssign);
router.put('/reorder',     authorize('ADMIN', 'MANAGER'),           ctrl.reorder);
router.delete('/bulk',     authorize('ADMIN', 'MANAGER'),           ctrl.bulkUnassign);
router.delete('/:id',      authorize('ADMIN', 'MANAGER'),           ctrl.unassignOne);

export default router;
