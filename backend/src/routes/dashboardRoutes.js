import { Router } from 'express';
import { asyncHandler } from '../middleware/validate.js';
import { summary } from '../controllers/dashboardController.js';

const router = Router();

router.get('/summary', asyncHandler(summary));

export default router;
