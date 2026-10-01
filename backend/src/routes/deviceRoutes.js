import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, validateBody } from '../middleware/validate.js';
import { requireAdmin, requireOperator } from '../middleware/auth.js';
import { DEVICE_TYPES, VENDORS, PROTOCOLS, DRIVERS } from '../models/Device.js';
import { list, listAll, get, create, update, remove, test, backupNow } from '../controllers/deviceController.js';

const router = Router();

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'must be a valid id');

const commandOverridesSchema = z
  .object({
    prompt: z.string().optional().default(''),
    disablePaging: z.string().optional().default(''),
    identify: z.string().optional().default(''),
    backup: z.string().optional().default(''),
    enterConfig: z.string().optional().default(''),
    exitConfig: z.string().optional().default(''),
    save: z.string().optional().default(''),
  })
  .optional();

const deviceSchema = z.object({
  name: z.string().trim().min(1, 'name is required'),
  host: z.string().trim().min(1, 'host is required'),
  port: z.coerce.number().int().min(1).max(65535).optional(),
  vendor: z.enum(VENDORS),
  deviceType: z.enum(DEVICE_TYPES),
  platform: z.string().trim().optional().default(''),
  model: z.string().trim().optional().default(''),
  osVersion: z.string().trim().optional().default(''),
  protocol: z.enum(PROTOCOLS).optional().default('ssh'),
  driver: z.enum(DRIVERS).optional().default('auto'),
  credential: objectId,
  location: z.string().trim().optional().default(''),
  tags: z.array(z.string().trim()).optional().default([]),
  notes: z.string().optional().default(''),
  commandOverrides: commandOverridesSchema,
});

const updateSchema = deviceSchema.partial();

router.get('/', asyncHandler(list));
router.get('/all', asyncHandler(listAll));
router.post('/', requireOperator, validateBody(deviceSchema), asyncHandler(create));
router.get('/:id', asyncHandler(get));
router.patch('/:id', requireOperator, validateBody(updateSchema), asyncHandler(update));
router.delete('/:id', requireAdmin, asyncHandler(remove));
router.post('/:id/test', requireOperator, asyncHandler(test));
router.post('/:id/backup', requireOperator, asyncHandler(backupNow));

export default router;
