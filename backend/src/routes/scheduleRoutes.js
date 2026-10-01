import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, validateBody } from '../middleware/validate.js';
import { requireAdmin, requireOperator } from '../middleware/auth.js';
import { list, get, create, update, remove } from '../controllers/scheduleController.js';

const router = Router();

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'must be a valid id');

const baseScheduleSchema = z.object({
  name: z.string().trim().min(2, 'name is required'),
  description: z.string().optional().default(''),
  type: z.enum(['backup', 'push_template']),
  cron: z.string().trim().min(9, 'a cron expression is required (e.g. "0 2 * * *")'),
  enabled: z.boolean().optional().default(true),
  timezone: z.string().trim().optional().default(''),
  devices: z.array(objectId).min(1, 'select at least one device'),
  template: objectId.optional(),
  variables: z.record(z.any()).optional().default({}),
  options: z.object({ backupAfter: z.boolean().optional() }).optional(),
});

// .partial() cannot be called on a refined schema, so the refinement lives on
// the create/update variant while PATCH uses the plain partial object.
const scheduleSchema = baseScheduleSchema.refine(
  (data) => data.type !== 'push_template' || Boolean(data.template),
  { message: 'a template is required for push_template schedules', path: ['template'] }
);

router.get('/', asyncHandler(list));
router.post('/', requireOperator, validateBody(scheduleSchema), asyncHandler(create));
router.get('/:id', asyncHandler(get));
router.patch('/:id', requireOperator, validateBody(baseScheduleSchema.partial()), asyncHandler(update));
router.delete('/:id', requireAdmin, asyncHandler(remove));

export default router;
