import { Router } from 'express';
import { authRouter } from './auth.routes.js';
import { adminRouter } from './admin.routes.js';
import { analyticsRouter } from './analytics.routes.js';
import { conversationRouter } from './conversation.routes.js';
import { healthRouter } from './health.routes.js';
import { knowledgeRouter } from './knowledge.routes.js';
import { notificationRouter } from './notification.routes.js';
import { ticketRouter } from './ticket.routes.js';
import { userRouter } from './user.routes.js';

export const router = Router();

router.use('/health', healthRouter);
router.use('/auth', authRouter);
router.use('/admin', adminRouter);
router.use('/analytics', analyticsRouter);
router.use('/users', userRouter);
router.use('/conversations', conversationRouter);
router.use('/knowledge', knowledgeRouter);
router.use('/notifications', notificationRouter);
router.use('/tickets', ticketRouter);
