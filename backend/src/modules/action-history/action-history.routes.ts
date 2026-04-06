import { Router } from 'express';
import { authenticate, authorize } from '../../shared/middleware/auth.middleware';
import * as ctrl from './action-history.controller';

const router = Router();
router.use(authenticate);

router.get('/logs',   authorize('ADMIN', 'MANAGER'), ctrl.getLogs);
router.get('/actors', authorize('ADMIN', 'MANAGER'), ctrl.getActors);

export default router;
