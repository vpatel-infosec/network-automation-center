import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, validateBody } from '../middleware/validate.js';
import { getTopology, verifyTopology, buildTopology, clearTopology, saveTopology, getSavedTopology } from '../controllers/topologyController.js';

const router = Router();

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'deviceIds must contain valid ids');
const topologyTargetSchema = z.object({
  ipAddress: z.string().trim().optional().default(''),
  ipRange: z.string().trim().optional().default(''),
  credentialId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'credentialId must be a valid id').optional(),
  deviceIds: z.array(objectId).max(500).optional().default([]),
  name: z.string().trim().max(120).optional().default(''),
});

router.get('/', asyncHandler(getTopology));
router.get('/saved', asyncHandler(getSavedTopology));
router.post('/verify', validateBody(topologyTargetSchema), asyncHandler(verifyTopology));
router.post('/build', validateBody(topologyTargetSchema), asyncHandler(buildTopology));
router.post('/save', asyncHandler(saveTopology));
router.delete('/clear', asyncHandler(clearTopology));

export default router;
