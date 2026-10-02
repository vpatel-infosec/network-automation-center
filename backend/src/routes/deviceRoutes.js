import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, validateBody } from '../middleware/validate.js';
import { requireAdmin, requireOperator } from '../middleware/auth.js';
import { deviceSchema, updateDeviceSchema } from '../utils/deviceValidation.js';
import { list, listAll, monitoring, get, create, bulkCreate, update, remove, test, backupNow } from '../controllers/deviceController.js';

const router = Router();

const bulkSchema = z.object({ rows: z.array(z.record(z.unknown())).min(1).max(200) });

router.get('/', asyncHandler(list));
router.get('/all', asyncHandler(listAll));
router.get('/monitoring', asyncHandler(monitoring));
router.post('/', requireOperator, validateBody(deviceSchema), asyncHandler(create));
router.post('/bulk', requireOperator, validateBody(bulkSchema), asyncHandler(bulkCreate));
router.get('/:id', asyncHandler(get));
router.patch('/:id', requireOperator, validateBody(updateDeviceSchema), asyncHandler(update));
router.delete('/:id', requireAdmin, asyncHandler(remove));
router.post('/:id/test', requireOperator, asyncHandler(test));
router.post('/:id/backup', requireOperator, asyncHandler(backupNow));

export default router;
