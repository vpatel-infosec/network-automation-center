import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, validateBody } from '../middleware/validate.js';
import { requireAdmin } from '../middleware/auth.js';
import { listUsers, createUser, updateUser, deleteUser } from '../controllers/userController.js';

const router = Router();
router.use(requireAdmin);

const createSchema = z.object({
  name: z.string().trim().min(2, 'name is required'),
  email: z.string().trim().toLowerCase().email('a valid email is required'),
  password: z.string().min(8, 'password must be at least 8 characters'),
  role: z.enum(['admin', 'operator', 'viewer']).optional(),
  active: z.boolean().optional(),
});

const updateSchema = z.object({
  name: z.string().trim().min(2).optional(),
  email: z.string().trim().toLowerCase().email().optional(),
  password: z.union([z.string().min(8), z.literal('')]).optional(),
  role: z.enum(['admin', 'operator', 'viewer']).optional(),
  active: z.boolean().optional(),
});

router.get('/', asyncHandler(listUsers));
router.post('/', validateBody(createSchema), asyncHandler(createUser));
router.patch('/:id', validateBody(updateSchema), asyncHandler(updateUser));
router.delete('/:id', asyncHandler(deleteUser));

export default router;
