import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, validateBody } from '../middleware/validate.js';
import { requireAdmin, requireOperator } from '../middleware/auth.js';
import { deviceSchema, updateDeviceSchema } from '../utils/deviceValidation.js';
import { list, listAll, monitoring, checkAll, get, create, bulkCreate, update, remove, test, backupNow, searchMacVlan, assignMacVlan } from '../controllers/deviceController.js';

const router = Router();

const bulkSchema = z.object({ rows: z.array(z.record(z.unknown())).min(1).max(200) });
const monitoringCheckSchema = z.object({
	deviceIds: z.array(z.string().regex(/^[0-9a-fA-F]{24}$/)).min(1).max(500).optional(),
});
const macSearchSchema = z.object({
	site: z.string().trim().min(1),
	macAddress: z.string().trim().min(1),
});
const vlanAssignSchema = z.object({
	site: z.string().trim().min(1),
	deviceId: z.string().regex(/^[0-9a-fA-F]{24}$/),
	macAddress: z.string().trim().min(1),
	port: z.string().trim().min(1).max(64),
	vlan: z.coerce.number().int().min(1).max(4094),
});

router.get('/', asyncHandler(list));
router.get('/all', asyncHandler(listAll));
router.get('/monitoring', asyncHandler(monitoring));
router.post('/monitoring/check', requireOperator, validateBody(monitoringCheckSchema), asyncHandler(checkAll));
router.post('/mac-vlan/search', requireOperator, validateBody(macSearchSchema), asyncHandler(searchMacVlan));
router.post('/mac-vlan/assign', requireOperator, validateBody(vlanAssignSchema), asyncHandler(assignMacVlan));
router.post('/', requireOperator, validateBody(deviceSchema), asyncHandler(create));
router.post('/bulk', requireOperator, validateBody(bulkSchema), asyncHandler(bulkCreate));
router.get('/:id', asyncHandler(get));
router.patch('/:id', requireOperator, validateBody(updateDeviceSchema), asyncHandler(update));
router.delete('/:id', requireAdmin, asyncHandler(remove));
router.post('/:id/test', requireOperator, asyncHandler(test));
router.post('/:id/backup', requireOperator, asyncHandler(backupNow));

export default router;
