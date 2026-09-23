import { Router } from 'express';
import { authRouter } from './auth.routes.js';
import { conversationRouter } from './conversation.routes.js';
import { healthRouter } from './health.routes.js';
import { knowledgeRouter } from './knowledge.routes.js';
import { ticketRouter } from './ticket.routes.js';
import { userRouter } from './user.routes.js';

export const router = Router();

router.use('/health', healthRouter);
router.use('/auth', authRouter);
router.use('/users', userRouter);
router.use('/conversations', conversationRouter);
router.use('/knowledge', knowledgeRouter);
router.use('/tickets', ticketRouter);

// Phase 5+: agents.routes, admin.routes, analytics.routes mount here.
