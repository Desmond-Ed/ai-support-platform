import { Router } from 'express';
import { healthRouter } from './health.routes.js';

export const router = Router();

router.use('/health', healthRouter);

// Phase 3+: auth.routes, users.routes, conversations.routes, tickets.routes,
// agents.routes, admin.routes, analytics.routes mount here.
