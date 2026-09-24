import type { Request, Response } from 'express';
import { AnalyticsService } from '../services/analytics.service.js';

export const AnalyticsController = {
  async overview(_req: Request, res: Response): Promise<void> {
    res.status(200).json({ overview: await AnalyticsService.overview() });
  },
};