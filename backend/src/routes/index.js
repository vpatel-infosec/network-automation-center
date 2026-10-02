import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/validate.js';
import { meta } from '../controllers/metaController.js';
import authRoutes from './authRoutes.js';
import userRoutes from './userRoutes.js';
import credentialRoutes from './credentialRoutes.js';
import deviceRoutes from './deviceRoutes.js';
import configRoutes from './configRoutes.js';
import templateRoutes from './templateRoutes.js';
import jobRoutes from './jobRoutes.js';
import scheduleRoutes from './scheduleRoutes.js';
import dashboardRoutes from './dashboardRoutes.js';
import auditRoutes from './auditRoutes.js';
import topologyRoutes from './topologyRoutes.js';
import siteRoutes from './siteRoutes.js';

const router = Router();

// Public (register itself decides whether the bootstrap is still open)
router.use('/auth', authRoutes);

// Everything below requires a valid session; write access is role-gated per route
router.use('/users', requireAuth, userRoutes);
router.use('/credentials', requireAuth, credentialRoutes);
router.use('/devices', requireAuth, deviceRoutes);
router.use('/configs', requireAuth, configRoutes);
router.use('/templates', requireAuth, templateRoutes);
router.use('/jobs', requireAuth, jobRoutes);
router.use('/schedules', requireAuth, scheduleRoutes);
router.use('/dashboard', requireAuth, dashboardRoutes);
router.use('/audit', requireAuth, auditRoutes);
router.use('/topology', requireAuth, topologyRoutes);
router.use('/sites', requireAuth, siteRoutes);
router.get('/meta', requireAuth, asyncHandler(meta));

export default router;
