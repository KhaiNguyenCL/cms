import { Router } from 'express';
import { authenticate, authorize } from '../../shared/middleware/auth.middleware';
import { validate } from '../../shared/middleware/validate.middleware';
import * as groupController from './device-groups.controller';
import {
    listGroupsSchema,
    createGroupSchema,
    updateGroupSchema,
    groupDeviceSchema,
} from './device-groups.schema';

const router = Router();

// All routes require authentication
router.use(authenticate);

// ── Group CRUD ────────────────────────────────────────────────────────────────

// GET /api/device-groups — list all groups
router.get(
    '/',
    authorize('ADMIN', 'MANAGER'),
    validate(listGroupsSchema),
    groupController.listGroups
);

// GET /api/device-groups/:id — get group detail (includes device members)
router.get(
    '/:id',
    authorize('ADMIN', 'MANAGER'),
    groupController.getGroup
);

// POST /api/device-groups — create a group (ADMIN+)
router.post(
    '/',
    authorize('ADMIN'),
    validate(createGroupSchema),
    groupController.createGroup
);

// PUT /api/device-groups/:id — update name/description (ADMIN+)
router.put(
    '/:id',
    authorize('ADMIN'),
    validate(updateGroupSchema),
    groupController.updateGroup
);

// DELETE /api/device-groups/:id — delete group (ADMIN+)
router.delete(
    '/:id',
    authorize('ADMIN'),
    groupController.deleteGroup
);

// ── Device membership ─────────────────────────────────────────────────────────

// POST /api/device-groups/:id/devices — add a device to this group (ADMIN+)
router.post(
    '/:id/devices',
    authorize('ADMIN'),
    validate(groupDeviceSchema),
    groupController.addDevice
);

// DELETE /api/device-groups/:id/devices/:deviceId — remove a device from group (ADMIN+)
router.delete(
    '/:id/devices/:deviceId',
    authorize('ADMIN'),
    groupController.removeDevice
);

export default router;
