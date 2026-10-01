import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, validateBody } from '../middleware/validate.js';
import { getTopology, verifyTopology, buildTopology } from '../controllers/topologyController.js';

const router = Router();

const topologyTargetSchema = z.object({
  ipAddress: z.string().trim().optional().default(''),
  ipRange: z.string().trim().optional().default(''),
  credentialId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'credentialId must be a valid id').optional(),
});

router.get('/', asyncHandler(getTopology));
router.post('/verify', validateBody(topologyTargetSchema), asyncHandler(verifyTopology));
router.post('/build', validateBody(topologyTargetSchema), asyncHandler(buildTopology));

export default router;
