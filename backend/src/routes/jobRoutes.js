import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, validateBody } from '../middleware/validate.js';
import { requireOperator } from '../middleware/auth.js';
import { list, get, create, cancel } from '../controllers/jobController.js';

const router = Router();

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'must be a valid id');

const createSchema = z.object({
  type: z.enum(['backup', 'command']),
  name: z.string().trim().optional(),
  deviceIds: z.array(objectId).min(1, 'select at least one device'),
  commands: z.array(z.string().trim().min(1)).optional().default([]),
  options: z
    .object({
      backupAfter: z.boolean().optional(),
      persist: z.boolean().optional(),
    })
    .optional(),
});

router.get('/', asyncHandler(list));
router.post('/', requireOperator, validateBody(createSchema), asyncHandler(create));
router.get('/:id', asyncHandler(get));
router.post('/:id/cancel', requireOperator, asyncHandler(cancel));

export default router;
