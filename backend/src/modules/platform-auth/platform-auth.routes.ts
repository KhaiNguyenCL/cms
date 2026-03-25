import { Router } from 'express';
import * as ctrl from './platform-auth.controller';
import { authenticatePlatformAdmin } from '../../shared/middleware/auth.middleware';

const router = Router();

// Public: login / refresh / logout
router.post('/login',   ctrl.login);
router.post('/refresh', ctrl.refresh);
router.post('/logout',  ctrl.logout);

// Protected: manage platform admins (requires PLATFORM_ADMIN auth)
router.use(authenticatePlatformAdmin);
router.get('/admins',        ctrl.listAdmins);
router.post('/admins',       ctrl.createAdmin);
router.patch('/admins/:id',  ctrl.updateAdmin);
router.delete('/admins/:id', ctrl.deleteAdmin);

export default router;
