import { Router } from 'express';
import { authenticate, authorize } from '../../shared/middleware/auth.middleware';
import { validate } from '../../shared/middleware/validate.middleware';
import * as ctrl from './sync-groups.controller';
import {
    listSyncGroupsSchema,
    createSyncGroupSchema,
    updateSyncGroupSchema,
    updateSyncGroupDevicesSchema,
} from './sync-groups.schema';

const router = Router();
router.use(authenticate);

router.get(  '/',                    authorize('ADMIN', 'MANAGER'), validate(listSyncGroupsSchema), ctrl.listSyncGroups);
router.get(  '/:id',                 authorize('ADMIN', 'MANAGER'), ctrl.getSyncGroup);
router.post( '/',                    authorize('ADMIN'),             validate(createSyncGroupSchema), ctrl.createSyncGroup);
router.patch('/:id',                 authorize('ADMIN'),             validate(updateSyncGroupSchema), ctrl.updateSyncGroup);
router.delete('/:id',                authorize('ADMIN'),             ctrl.deleteSyncGroup);

// Playback controls
router.post( '/:id/start',           authorize('ADMIN', 'MANAGER'), ctrl.startSyncGroup);
router.post( '/:id/restart',         authorize('ADMIN', 'MANAGER'), ctrl.restartSyncGroup);
router.post( '/:id/stop',            authorize('ADMIN', 'MANAGER'), ctrl.stopSyncGroup);

// Device assignment
router.patch('/:id/devices',         authorize('ADMIN'),             validate(updateSyncGroupDevicesSchema), ctrl.updateSyncGroupDevices);

export default router;
