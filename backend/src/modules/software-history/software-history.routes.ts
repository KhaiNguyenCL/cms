import { Router } from 'express';
import { authenticate, authorize } from '../../shared/middleware/auth.middleware';
import * as ctrl from './software-history.controller';

const router = Router();
router.use(authenticate);

// Devices
router.get('/devices',               authorize('ADMIN', 'MANAGER'), ctrl.getDevices);
router.get('/devices/:id/logs',      authorize('ADMIN', 'MANAGER'), ctrl.getDeviceLogs);
router.post('/devices/:id/ota',      authorize('ADMIN'),            ctrl.pushOta);

// Bulk OTA
router.post('/ota/push-all',         authorize('ADMIN'),            ctrl.pushOtaAll);

// Outdated report
router.get('/report/outdated',       authorize('ADMIN', 'MANAGER'), ctrl.getReport);

// App version catalog
router.get('/versions',              authorize('ADMIN', 'MANAGER'), ctrl.listVersions);
router.post('/versions',             authorize('ADMIN'),            ctrl.createVersion);
router.patch('/versions/:id/latest', authorize('ADMIN'),            ctrl.setLatest);
router.delete('/versions/:id',       authorize('ADMIN'),            ctrl.deleteVersion);

export default router;
