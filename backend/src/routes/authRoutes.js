import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, validateBody } from '../middleware/validate.js';
import { optionalAuth, requireAuth } from '../middleware/auth.js';
import { setupStatus, register, login, me } from '../controllers/authController.js';

const router = Router();

const email = z.string().trim().toLowerCase().email('a valid email is required');
const password = z.string().min(8, 'password must be at least 8 characters');

const registerSchema = z.object({
  name: z.string().trim().min(2, 'name is required'),
  email,
  password,
  role: z.enum(['admin', 'operator', 'viewer']).optional(),
});

const loginSchema = z.object({
  email,
  password: z.string().min(1, 'password is required'),
});

router.get('/setup-status', asyncHandler(setupStatus));
router.post('/register', optionalAuth, validateBody(registerSchema), asyncHandler(register));
router.post('/login', validateBody(loginSchema), asyncHandler(login));
router.get('/me', requireAuth, asyncHandler(me));

export default router;
