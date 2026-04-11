import { Router } from 'express';
import * as ctrl from './platform-auth.controller';
import * as mailCtrl from '../mail-config/mail-config.controller';
import * as templateCtrl from '../mail-config/mail-template.controller';
import * as storageCtrl from '../storage-quota/storage-quota.controller';
import { authenticatePlatformAdmin } from '../../shared/middleware/auth.middleware';

const router = Router();

// Public: login / refresh / logout
router.post('/login',   ctrl.login);
router.post('/refresh', ctrl.refresh);
router.post('/logout',  ctrl.logout);

// Protected: manage platform admins (requires PLATFORM_ADMIN auth)
router.use(authenticatePlatformAdmin);
router.get('/me',            ctrl.getMe);
router.get('/admins',        ctrl.listAdmins);
router.post('/admins',       ctrl.createAdmin);
router.patch('/admins/:id',  ctrl.updateAdmin);
router.delete('/admins/:id', ctrl.deleteAdmin);

// Mail config management
router.get('/mail-configs',              mailCtrl.list);
router.post('/mail-configs',             mailCtrl.create);
router.put('/mail-configs/:id',          mailCtrl.update);
router.delete('/mail-configs/:id',       mailCtrl.remove);
router.post('/mail-configs/:id/activate', mailCtrl.setActive);
router.post('/mail-configs/test',        mailCtrl.testMail);

// Mail template management
router.get('/mail-templates',            templateCtrl.listTemplates);
router.post('/mail-templates',           templateCtrl.createTemplate);
router.put('/mail-templates/:id',        templateCtrl.updateTemplate);
router.delete('/mail-templates/:id',     templateCtrl.deleteTemplate);

// Mail event settings
router.get('/mail-settings',             templateCtrl.listSettings);
router.put('/mail-settings/:eventType',  templateCtrl.updateSetting);

// Storage quota management
router.get('/storage/orgs',                               storageCtrl.getAllOrgStats);
router.patch('/storage/orgs/:orgId/pool',                 storageCtrl.adjustPool);
router.get('/storage/purchase-requests',                  storageCtrl.listAllRequests);
router.post('/storage/purchase-requests/:id/approve',     storageCtrl.approveRequest);
router.post('/storage/purchase-requests/:id/reject',      storageCtrl.rejectRequest);

export default router;
