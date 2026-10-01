import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, validateBody } from '../middleware/validate.js';
import { requireAdmin, requireOperator } from '../middleware/auth.js';
import { list, get, diff, restore, remove } from '../controllers/configController.js';

const router = Router();

const restoreSchema = z.object({
  backupAfter: z.boolean().optional().default(true),
});

router.get('/', asyncHandler(list));
router.get('/diff', asyncHandler(diff));
router.get('/:id', asyncHandler(get));
router.post('/:id/restore', requireOperator, validateBody(restoreSchema), asyncHandler(restore));
router.delete('/:id', requireAdmin, asyncHandler(remove));

export default router;
