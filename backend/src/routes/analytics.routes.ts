import { Router } from 'express';
import { AnalyticsController } from '../controllers/analytics.controller.js';
import { authenticate, requireRole } from '../middleware/auth.middleware.js';

export const analyticsRouter = Router();

analyticsRouter.use(authenticate, requireRole('ADMIN', 'AGENT'));
analyticsRouter.get('/overview', AnalyticsController.overview);