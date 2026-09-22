import { Router } from 'express';

export const healthRouter = Router();

/**
 * Liveness/readiness probe. Kept dependency-free on purpose so it responds
 * even if Postgres/Redis/AI service are degraded — orchestration
 * (Docker/Railway) uses this to know the Node process itself is up.
 * A separate /health/deps check can be added later if we want dependency
 * status surfaced here too.
 */
healthRouter.get('/', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'backend',
    timestamp: new Date().toISOString(),
  });
});
