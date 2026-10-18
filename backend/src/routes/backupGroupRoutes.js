import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, validateBody } from '../middleware/validate.js';
import { requireOperator } from '../middleware/auth.js';
import { list, create, update, remove } from '../controllers/backupGroupController.js';

const router = Router();
const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/);
const groupSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(500).optional().default(''),
  deviceIds: z.array(objectId).max(500).optional().default([]),
});

router.get('/', asyncHandler(list));
router.post('/', requireOperator, validateBody(groupSchema), asyncHandler(create));
router.patch('/:id', requireOperator, validateBody(groupSchema.partial()), asyncHandler(update));
router.delete('/:id', requireOperator, asyncHandler(remove));

export default router;