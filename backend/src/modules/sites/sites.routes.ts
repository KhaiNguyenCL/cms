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

router.get(  '/',              authorize('ADMIN', 'MANAGER'), validate(listSitesSchema),         ctrl.listSites);
router.get(  '/:id',           authorize('ADMIN', 'MANAGER'),                                     ctrl.getSite);
router.post( '/',              authorize('ADMIN'),             validate(createSiteSchema),        ctrl.createSite);
router.patch('/:id',           authorize('ADMIN'),             validate(updateSiteSchema),        ctrl.updateSite);
router.delete('/:id',          authorize('ADMIN'),                                                 ctrl.deleteSite);

// Playback controls
router.post( '/:id/start',     authorize('ADMIN', 'MANAGER'),                                     ctrl.startSite);
router.post( '/:id/restart',   authorize('ADMIN', 'MANAGER'),                                     ctrl.restartSite);
router.post( '/:id/stop',      authorize('ADMIN', 'MANAGER'),                                     ctrl.stopSite);

// Device assignment
router.patch('/:id/devices',   authorize('ADMIN'),             validate(updateSiteDevicesSchema), ctrl.updateSiteDevices);

export default router;
