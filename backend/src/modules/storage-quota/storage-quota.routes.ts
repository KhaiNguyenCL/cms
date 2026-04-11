import { Router } from 'express';
import { authenticate, authorize } from '../../shared/middleware/auth.middleware';
import * as ctrl from './storage-quota.controller';

const router = Router();

router.use(authenticate);

// Org users: view usage + submit requests
router.get('/usage',             ctrl.getUsage);
router.get('/purchase-requests', ctrl.listOwnRequests);
router.post('/purchase-requests', authorize('ADMIN'), ctrl.createRequest);

// SUPER_ADMIN: manage all orgs' storage requests
router.get('/admin/purchase-requests',                authorize('SUPER_ADMIN'), ctrl.listAllRequests);
router.post('/admin/purchase-requests/:id/approve',   authorize('SUPER_ADMIN'), ctrl.approveRequest);
router.post('/admin/purchase-requests/:id/reject',    authorize('SUPER_ADMIN'), ctrl.rejectRequest);

export default router;
