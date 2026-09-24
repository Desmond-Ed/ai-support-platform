import type { Request, Response } from 'express';
import { AppError } from '../utils/AppError.js';
import { NotificationService } from '../services/notification.service.js';

function userId(req: Request): string {
  if (!req.user) throw new AppError('Not authenticated', 401);
  return req.user.id;
}

export const NotificationController = {
  async list(req: Request, res: Response): Promise<void> {
    const unreadOnly = req.query.unread === 'true';
    const notifications = await NotificationService.listForUser(userId(req), unreadOnly);
    res.status(200).json({ notifications });
  },

  async markRead(req: Request, res: Response): Promise<void> {
    if (typeof req.params.id !== 'string') throw new AppError('Notification not found', 404);
    const notification = await NotificationService.markRead(userId(req), req.params.id);
    if (!notification) throw new AppError('Notification not found', 404);
    res.status(200).json({ notification });
  },

  async markAllRead(req: Request, res: Response): Promise<void> {
    const count = await NotificationService.markAllRead(userId(req));
    res.status(200).json({ count });
  },
};