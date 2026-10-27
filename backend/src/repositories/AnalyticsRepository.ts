import { prisma } from '../config/db.js';

type CountRow = { date: string; count: number };
type ResolutionRow = { date: string; count: number; average_seconds: number | null };

export const AnalyticsRepository = {
  async conversationsCreatedByDay(from: Date, toExclusive: Date): Promise<CountRow[]> {
    return prisma.$queryRaw<CountRow[]>`
      SELECT to_char(date_trunc('day', "createdAt" AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS date,
             COUNT(*)::int AS count
      FROM "conversations"
      WHERE "createdAt" >= ${from} AND "createdAt" < ${toExclusive}
      GROUP BY 1
      ORDER BY 1 ASC
    `;
  },

  async ticketsCreatedByDay(from: Date, toExclusive: Date): Promise<CountRow[]> {
    return prisma.$queryRaw<CountRow[]>`
      SELECT to_char(date_trunc('day', "createdAt" AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS date,
             COUNT(*)::int AS count
      FROM "tickets"
      WHERE "createdAt" >= ${from} AND "createdAt" < ${toExclusive}
      GROUP BY 1
      ORDER BY 1 ASC
    `;
  },

  async ticketsResolvedByDay(from: Date, toExclusive: Date): Promise<ResolutionRow[]> {
    return prisma.$queryRaw<ResolutionRow[]>`
      SELECT to_char(date_trunc('day', "resolvedAt" AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS date,
             COUNT(*)::int AS count,
             AVG(EXTRACT(EPOCH FROM ("resolvedAt" - "createdAt")))::double precision AS average_seconds
      FROM "tickets"
      WHERE "resolvedAt" >= ${from} AND "resolvedAt" < ${toExclusive}
      GROUP BY 1
      ORDER BY 1 ASC
    `;
  },
};
