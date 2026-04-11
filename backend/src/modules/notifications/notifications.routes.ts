import { Router } from 'express';
import { authenticate } from '../../shared/middleware/auth.middleware';
import * as ctrl from './notifications.controller';

const router = Router();
router.use(authenticate);

router.get('/',               ctrl.list);
router.post('/read-all',      ctrl.readAll);
router.patch('/:id/read',     ctrl.read);
router.delete('/:id',         ctrl.remove);

export default router;
