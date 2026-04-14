import { Router } from 'express';
import { authenticate, authorize } from '../../shared/middleware/auth.middleware';
import { validate } from '../../shared/middleware/validate.middleware';
import * as ctrl from './sites.controller';
import {
    listSitesSchema,
    createSiteSchema,
    updateSiteSchema,
    updateSiteDevicesSchema,
} from './sites.schema';

const router = Router();
router.use(authenticate);

router.get(  '/',              authorize('ADMIN', 'MANAGER', 'CONTENT_MANAGER', 'SITE_MANAGER'), validate(listSitesSchema), ctrl.listSites);
router.get(  '/:id',           authorize('ADMIN', 'MANAGER', 'CONTENT_MANAGER', 'SITE_MANAGER'),  ctrl.getSite);
router.post( '/',              authorize('ADMIN'),             validate(createSiteSchema),        ctrl.createSite);
router.patch('/:id',           authorize('ADMIN', 'SITE_MANAGER'), validate(updateSiteSchema),    ctrl.updateSite);
router.delete('/:id',          authorize('ADMIN'),                                                 ctrl.deleteSite);

// Playback controls
router.post( '/:id/start',     authorize('ADMIN', 'MANAGER', 'SITE_MANAGER'),                     ctrl.startSite);
router.post( '/:id/restart',   authorize('ADMIN', 'MANAGER', 'SITE_MANAGER'),                     ctrl.restartSite);
router.post( '/:id/stop',      authorize('ADMIN', 'MANAGER', 'SITE_MANAGER'),                     ctrl.stopSite);

// Device assignment
router.patch('/:id/devices',   authorize('ADMIN'),             validate(updateSiteDevicesSchema), ctrl.updateSiteDevices);

export default router;
