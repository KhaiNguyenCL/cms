import { Router } from 'express';
import { authenticate, authorize } from '../../shared/middleware/auth.middleware';
import * as ctrl from './license.controller';

const router = Router();
router.use(authenticate);

// Read (all roles)
router.get('/stats',    authorize('ADMIN', 'MANAGER'), ctrl.getStats);
router.get('/pool',     authorize('ADMIN', 'MANAGER'), ctrl.getPool);
router.get('/devices',  authorize('ADMIN', 'MANAGER'), ctrl.getDeviceLicenses);
router.get('/history',  authorize('ADMIN', 'MANAGER'), ctrl.getHistory);
router.get('/requests', authorize('ADMIN', 'MANAGER'), ctrl.getPurchaseRequests);

// License operations (ADMIN)
router.post('/assign',          authorize('ADMIN'), ctrl.assignLicense);
router.post('/transfer',        authorize('ADMIN'), ctrl.transferLicense);
router.post('/adjust-expiry',   authorize('ADMIN'), ctrl.adjustExpiry);
router.delete('/revoke/:deviceId', authorize('ADMIN'), ctrl.revokeLicense);

// Purchase requests
router.post('/requests',                    authorize('ADMIN', 'MANAGER'), ctrl.createPurchaseRequest);
router.post('/requests/:id/approve',        authorize('SUPER_ADMIN'),      ctrl.approvePurchaseRequest);
router.post('/requests/:id/reject',         authorize('SUPER_ADMIN'),      ctrl.rejectPurchaseRequest);

// Admin endpoints (SUPER_ADMIN)
router.get('/admin/orgs',                                  authorize('SUPER_ADMIN'), ctrl.getAllOrgPools);
router.get('/admin/orgs/:orgId/detail',                    authorize('SUPER_ADMIN'), ctrl.getOrgDetail);
router.patch('/admin/orgs/:orgId/pool',                    authorize('SUPER_ADMIN'), ctrl.updateOrgPool);
router.post('/admin/orgs/:orgId/transfer',                  authorize('SUPER_ADMIN'), ctrl.adminTransferLicense);
router.delete('/admin/orgs/:orgId/revoke/:deviceId',       authorize('SUPER_ADMIN'), ctrl.adminRevokeLicense);
router.post('/admin/orgs/:orgId/adjust-expiry',            authorize('SUPER_ADMIN'), ctrl.adminAdjustExpiry);

export default router;
