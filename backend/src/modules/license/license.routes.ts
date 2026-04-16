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

// License operations — assign only for ADMIN (transfer/revoke/adjust-expiry: SUPER_ADMIN only via admin routes)
router.post('/assign', authorize('ADMIN'), ctrl.assignLicense);

// Purchase requests
router.post('/requests',                    authorize('ADMIN', 'MANAGER'), ctrl.createPurchaseRequest);
router.post('/requests/:id/approve',        authorize('SUPER_ADMIN'),      ctrl.approvePurchaseRequest);
router.post('/requests/:id/reject',         authorize('SUPER_ADMIN'),      ctrl.rejectPurchaseRequest);

// Transfer requests
router.get ('/transfer-requests',                    authorize('ADMIN', 'MANAGER'), ctrl.getTransferRequests);
router.post('/transfer-requests',                    authorize('ADMIN', 'MANAGER'), ctrl.createTransferRequest);
router.post('/transfer-requests/:id/approve',        authorize('SUPER_ADMIN'),      ctrl.approveTransferRequest);
router.post('/transfer-requests/:id/reject',         authorize('SUPER_ADMIN'),      ctrl.rejectTransferRequest);

// Admin endpoints (SUPER_ADMIN)
router.get('/admin/orgs',                                  authorize('SUPER_ADMIN'), ctrl.getAllOrgPools);
router.get('/admin/orgs/:orgId/detail',                    authorize('SUPER_ADMIN'), ctrl.getOrgDetail);
router.patch('/admin/orgs/:orgId/pool',                    authorize('SUPER_ADMIN'), ctrl.updateOrgPool);
router.post('/admin/orgs/:orgId/transfer',                  authorize('SUPER_ADMIN'), ctrl.adminTransferLicense);
router.delete('/admin/orgs/:orgId/revoke/:deviceId',       authorize('SUPER_ADMIN'), ctrl.adminRevokeLicense);
router.post('/admin/orgs/:orgId/adjust-expiry',            authorize('SUPER_ADMIN'), ctrl.adminAdjustExpiry);

export default router;
