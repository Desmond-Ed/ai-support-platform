import { prisma } from '../config/db.js';
import { AnalyticsRepository } from '../repositories/AnalyticsRepository.js';
import { eachUtcDate, resolveDateRange } from '../utils/dateRange.js';

export interface AnalyticsQuery {
  from?: string;
  to?: string;
}

export interface AnalyticsDay {
  date: string;
  conversationsCreated: number;
  ticketsCreated: number;
  ticketsResolved: number;
  averageResolutionSeconds: number | null;
}

function roundSeconds(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return null;
  return Math.round(Number(value) * 100) / 100;
}

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
      aiResolutionRate: conversations === 0 ? 0 : (resolvedByAI / conversations) * 100,
      unreadNotifications,
      knowledgeByStatus,
    };
  },

  async timeseries(query: AnalyticsQuery) {
    const range = resolveDateRange(query.from, query.to, { defaultDays: 30, maxDays: 90 });
    const [conversations, ticketsCreated, ticketsResolved] = await Promise.all([
      AnalyticsRepository.conversationsCreatedByDay(range.fromDate, range.toDateExclusive),
      AnalyticsRepository.ticketsCreatedByDay(range.fromDate, range.toDateExclusive),
      AnalyticsRepository.ticketsResolvedByDay(range.fromDate, range.toDateExclusive),
    ]);

    const conversationCounts = new Map(conversations.map((row) => [row.date, Number(row.count)]));
    const ticketCounts = new Map(ticketsCreated.map((row) => [row.date, Number(row.count)]));
    const resolutionByDate = new Map(
      ticketsResolved.map((row) => [
        row.date,
        { count: Number(row.count), averageSeconds: roundSeconds(row.average_seconds) },
      ]),
    );

    const series: AnalyticsDay[] = eachUtcDate(range.from, range.dayCount).map((date) => {
      const resolution = resolutionByDate.get(date);
      return {
        date,
        conversationsCreated: conversationCounts.get(date) ?? 0,
        ticketsCreated: ticketCounts.get(date) ?? 0,
        ticketsResolved: resolution?.count ?? 0,
        averageResolutionSeconds: resolution?.averageSeconds ?? null,
      };
    });

    const totals = series.reduce(
      (current, day) => ({
        conversationsCreated: current.conversationsCreated + day.conversationsCreated,
        ticketsCreated: current.ticketsCreated + day.ticketsCreated,
        ticketsResolved: current.ticketsResolved + day.ticketsResolved,
        resolutionSecondsTotal:
          current.resolutionSecondsTotal +
          (day.averageResolutionSeconds === null
            ? 0
            : day.averageResolutionSeconds * day.ticketsResolved),
      }),
      {
        conversationsCreated: 0,
        ticketsCreated: 0,
        ticketsResolved: 0,
        resolutionSecondsTotal: 0,
      },
    );

    return {
      range: { from: range.from, to: range.to, days: range.dayCount },
      series,
      summary: {
        conversationsCreated: totals.conversationsCreated,
        ticketsCreated: totals.ticketsCreated,
        ticketsResolved: totals.ticketsResolved,
        averageResolutionSeconds:
          totals.ticketsResolved === 0
            ? null
            : roundSeconds(totals.resolutionSecondsTotal / totals.ticketsResolved),
      },
    };
  },
};
