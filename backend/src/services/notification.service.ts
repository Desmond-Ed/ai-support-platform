import type { Notification, NotificationType } from '../generated/prisma/client.js';
import { NotificationRepository } from '../repositories/NotificationRepository.js';
import type { RealtimeEvents } from '../sockets/index.js';

type NotificationPayload = RealtimeEvents['notification'];
type NotificationEmitter = (userId: string, payload: NotificationPayload) => void;

let emitNotification: NotificationEmitter | undefined;

export const NotificationService = {
  setEmitter(emitter: NotificationEmitter): void {
    emitNotification = emitter;
  },

  async listForUser(userId: string, unreadOnly = false): Promise<Notification[]> {
    return NotificationRepository.findForUser(userId, unreadOnly);
  },

  async markRead(userId: string, notificationId: string): Promise<Notification | null> {
    return NotificationRepository.markRead(userId, notificationId);
  },

  async markAllRead(userId: string): Promise<number> {
    return NotificationRepository.markAllRead(userId);
  },

  async create(
    userId: string,
    type: NotificationType,
    payload: NotificationPayload,
  ): Promise<Notification> {
    const notification = await NotificationRepository.create(userId, type, payload);
    emitNotification?.(userId, payload);
    return notification;
  },
};