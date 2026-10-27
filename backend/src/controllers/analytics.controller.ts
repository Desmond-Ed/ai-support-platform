import type { Request, Response } from 'express';
import { AnalyticsService } from '../services/analytics.service.js';
import type { AnalyticsTimeseriesQuery } from '../validators/analytics.validators.js';

export const AnalyticsController = {
  async overview(_req: Request, res: Response): Promise<void> {
    res.status(200).json({ overview: await AnalyticsService.overview() });
  },

  async timeseries(req: Request, res: Response): Promise<void> {
    const query = req.query as AnalyticsTimeseriesQuery;
    res.status(200).json(await AnalyticsService.timeseries({ from: query.from, to: query.to }));
  },
};
