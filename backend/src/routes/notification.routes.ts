import { Router } from 'express';
import { NotificationController } from '../controllers/notification.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';

export const notificationRouter = Router();

notificationRouter.use(authenticate);
notificationRouter.get('/', NotificationController.list);
notificationRouter.patch('/read-all', NotificationController.markAllRead);
notificationRouter.patch('/:id/read', NotificationController.markRead);