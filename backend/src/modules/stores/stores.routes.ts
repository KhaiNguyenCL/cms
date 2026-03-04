import { Router } from 'express';
import { authenticate, authorize } from '../../shared/middleware/auth.middleware';
import { validate } from '../../shared/middleware/validate.middleware';
import * as ctrl from './stores.controller';
import {
    listStoresSchema,
    createStoreSchema,
    updateStoreSchema,
    updateStoreDevicesSchema,
} from './stores.schema';

const router = Router();
router.use(authenticate);

router.get(  '/',              authorize('ADMIN', 'MANAGER'), validate(listStoresSchema),         ctrl.listStores);
router.get(  '/:id',           authorize('ADMIN', 'MANAGER'),                                     ctrl.getStore);
router.post( '/',              authorize('ADMIN'),             validate(createStoreSchema),        ctrl.createStore);
router.patch('/:id',           authorize('ADMIN'),             validate(updateStoreSchema),        ctrl.updateStore);
router.delete('/:id',          authorize('ADMIN'),                                                 ctrl.deleteStore);

// Playback controls
router.post( '/:id/start',     authorize('ADMIN', 'MANAGER'),                                     ctrl.startStore);
router.post( '/:id/restart',   authorize('ADMIN', 'MANAGER'),                                     ctrl.restartStore);
router.post( '/:id/stop',      authorize('ADMIN', 'MANAGER'),                                     ctrl.stopStore);

// Device assignment
router.patch('/:id/devices',   authorize('ADMIN'),             validate(updateStoreDevicesSchema), ctrl.updateStoreDevices);

export default router;
