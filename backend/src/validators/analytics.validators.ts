import { z } from 'zod';

export const analyticsTimeseriesQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
});

export type AnalyticsTimeseriesQuery = z.infer<typeof analyticsTimeseriesQuerySchema>;
