import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, validateBody } from '../middleware/validate.js';
import { requireAdmin, requireOperator } from '../middleware/auth.js';
import { list, get, create, update, remove, verify } from '../controllers/credentialController.js';

const router = Router();

const credentialSchema = z.object({
  name: z.string().trim().min(2, 'name is required'),
  description: z.string().trim().max(500).optional().default(''),
  username: z.string().trim().min(1, 'username is required'),
  password: z.string().optional().default(''),
  enablePassword: z.string().optional().default(''),
  sshPrivateKey: z.string().optional().default(''),
  sshPassphrase: z.string().optional().default(''),
});

const updateSchema = credentialSchema.partial();

router.get('/', asyncHandler(list));
router.post('/', requireOperator, validateBody(credentialSchema), asyncHandler(create));
router.get('/:id', asyncHandler(get));
router.patch('/:id', requireOperator, validateBody(updateSchema), asyncHandler(update));
router.delete('/:id', requireAdmin, asyncHandler(remove));
router.post('/:id/verify', requireAdmin, asyncHandler(verify));

export default router;
