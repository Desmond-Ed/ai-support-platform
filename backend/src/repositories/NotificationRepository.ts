import { prisma } from '../config/db.js';
import type { Notification, NotificationType, Prisma } from '../generated/prisma/client.js';

export const NotificationRepository = {
  async findForUser(userId: string, unreadOnly = false): Promise<Notification[]> {
    return prisma.notification.findMany({
      where: { userId, ...(unreadOnly ? { read: false } : {}) },
      orderBy: { createdAt: 'desc' },
    });
  },

  async create(
    userId: string,
    type: NotificationType,
    payload: Prisma.InputJsonValue,
  ): Promise<Notification> {
    return prisma.notification.create({
      data: { userId, type, payload },
    });
  },

  async markRead(userId: string, notificationId: string): Promise<Notification | null> {
    const result = await prisma.notification.updateMany({
      where: { id: notificationId, userId },
      data: { read: true },
    });

    if (result.count === 0) return null;
    return prisma.notification.findUnique({ where: { id: notificationId } });
  },

  async markAllRead(userId: string): Promise<number> {
    const result = await prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    });
    return result.count;
  },
};