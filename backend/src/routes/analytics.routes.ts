import { Router } from 'express';
import { AnalyticsController } from '../controllers/analytics.controller.js';
import { authenticate, requireRole } from '../middleware/auth.middleware.js';
import { validateQuery } from '../middleware/validate.js';
import { analyticsTimeseriesQuerySchema } from '../validators/analytics.validators.js';

export const analyticsRouter = Router();

analyticsRouter.use(authenticate, requireRole('ADMIN', 'AGENT'));
analyticsRouter.get('/overview', AnalyticsController.overview);
analyticsRouter.get(
  '/timeseries',
  validateQuery(analyticsTimeseriesQuerySchema),
  AnalyticsController.timeseries,
);