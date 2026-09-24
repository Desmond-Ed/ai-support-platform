import { prisma } from '../config/db.js';

export const AnalyticsService = {
  async overview() {
    const [ticketsByStatus, conversations, resolvedByAI, unreadNotifications, knowledgeByStatus] =
      await Promise.all([
        prisma.ticket.groupBy({ by: ['status'], _count: { _all: true } }),
        prisma.conversation.count(),
        prisma.conversation.count({ where: { resolvedByAI: true } }),
        prisma.notification.count({ where: { read: false } }),
        prisma.knowledgeDocument.groupBy({ by: ['status'], _count: { _all: true } }),
      ]);

    return {
      ticketsByStatus,
      conversations,
      resolvedByAI,
      aiResolutionRate: conversations === 0 ? 0 : resolvedByAI / conversations,
      unreadNotifications,
      knowledgeByStatus,
    };
  },
};