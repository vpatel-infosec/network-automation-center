import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, validateBody } from '../middleware/validate.js';
import { requireAdmin, requireOperator } from '../middleware/auth.js';
import { listSites, createSite, updateSite, deleteSite } from '../controllers/siteController.js';

const router = Router();

const siteSchema = z.object({
  name: z.string().trim().min(2, 'site name is required'),
  code: z.string().trim().optional().default(''),
  description: z.string().trim().optional().default(''),
  address: z.string().trim().optional().default(''),
  region: z.string().trim().optional().default(''),
  active: z.boolean().optional().default(true),
});

const updateSchema = siteSchema.partial();

router.get('/', requireOperator, asyncHandler(listSites));
router.post('/', requireAdmin, validateBody(siteSchema), asyncHandler(createSite));
router.patch('/:id', requireAdmin, validateBody(updateSchema), asyncHandler(updateSite));
router.delete('/:id', requireAdmin, asyncHandler(deleteSite));

export default router;
