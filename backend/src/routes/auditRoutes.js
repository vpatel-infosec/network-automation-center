import { Router } from 'express';
import { asyncHandler } from '../middleware/validate.js';
import { requireOperator } from '../middleware/auth.js';
import { list, actions } from '../controllers/auditController.js';

const router = Router();
router.use(requireOperator);

router.get('/', asyncHandler(list));
router.get('/actions', asyncHandler(actions));

export default router;
