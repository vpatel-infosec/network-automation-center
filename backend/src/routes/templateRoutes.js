import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, validateBody } from '../middleware/validate.js';
import { requireAdmin, requireOperator } from '../middleware/auth.js';
import { DEVICE_TYPES, VENDORS } from '../models/Device.js';
import { list, get, create, update, remove, preview, push } from '../controllers/templateController.js';

const router = Router();

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'must be a valid id');

const variableSchema = z.object({
  name: z.string().trim().min(1),
  label: z.string().optional().default(''),
  description: z.string().optional().default(''),
  required: z.boolean().optional().default(true),
  defaultValue: z.string().optional().default(''),
});

const templateSchema = z.object({
  name: z.string().trim().min(2, 'name is required'),
  description: z.string().optional().default(''),
  targetVendors: z.array(z.enum(VENDORS)).optional().default([]),
  targetDeviceTypes: z.array(z.enum(DEVICE_TYPES)).optional().default([]),
  content: z.string().min(1, 'template body is required'),
  variables: z.array(variableSchema).optional().default([]),
  tags: z.array(z.string().trim()).optional().default([]),
});

const previewSchema = z.object({
  deviceId: objectId.optional(),
  variables: z.record(z.any()).optional().default({}),
});

const pushSchema = z.object({
  name: z.string().trim().optional(),
  deviceIds: z.array(objectId).min(1, 'select at least one device'),
  variables: z.record(z.any()).optional().default({}),
  options: z
    .object({
      backupAfter: z.boolean().optional().default(true),
      persist: z.boolean().optional().default(true),
    })
    .optional(),
});

router.get('/', asyncHandler(list));
router.post('/', requireOperator, validateBody(templateSchema), asyncHandler(create));
router.get('/:id', asyncHandler(get));
router.patch('/:id', requireOperator, validateBody(templateSchema.partial()), asyncHandler(update));
router.delete('/:id', requireAdmin, asyncHandler(remove));
router.post('/:id/preview', validateBody(previewSchema), asyncHandler(preview));
router.post('/:id/push', requireOperator, validateBody(pushSchema), asyncHandler(push));

export default router;
