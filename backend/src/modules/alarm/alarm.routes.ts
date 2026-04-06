import { Router } from 'express';
import { authenticate, authorize } from '../../shared/middleware/auth.middleware';
import * as ctrl from './alarm.controller';

const router = Router();
router.use(authenticate);

// Device list + history
router.get('/devices',              authorize('ADMIN', 'MANAGER'), ctrl.getDevices);
router.get('/devices/:id/history',  authorize('ADMIN', 'MANAGER'), ctrl.getDeviceHistory);
router.get('/history',              authorize('ADMIN', 'MANAGER'), ctrl.getOrgHistory);

// Email management
router.get   ('/emails',              authorize('ADMIN', 'MANAGER'), ctrl.getEmails);
router.post  ('/emails',              authorize('ADMIN'),            ctrl.addEmail);
router.patch ('/emails/:emailId',     authorize('ADMIN'),            ctrl.updateEmail);
router.delete('/emails/:emailId',     authorize('ADMIN'),            ctrl.deleteEmail);
router.post  ('/emails/test',         authorize('ADMIN'),            ctrl.testEmail);

export default router;
