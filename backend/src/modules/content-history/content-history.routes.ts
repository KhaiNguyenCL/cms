import { Router } from 'express';
import { authenticate, authorize } from '../../shared/middleware/auth.middleware';
import * as ctrl from './content-history.controller';

const router = Router();
router.use(authenticate);

router.get('/devices',          authorize('ADMIN', 'MANAGER'), ctrl.getDevices);
router.get('/devices/:id/logs', authorize('ADMIN', 'MANAGER'), ctrl.getDeviceLogs);

export default router;
