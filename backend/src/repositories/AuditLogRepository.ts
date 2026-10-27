import { prisma } from '../config/db.js';
import type { Prisma } from '../generated/prisma/client.js';

type Db = Prisma.TransactionClient | typeof prisma;

export interface AuditListFilters {
  action?: string;
  actorId?: string;
  entityType?: string;
  entityId?: string;
  fromDate?: Date;
  toDateExclusive?: Date;
  page: number;
  pageSize: number;
}

export const AuditLogRepository = {
  async create(
    data: {
      userId: string | null;
      action: string;
      entityType: string;
      entityId: string;
      metadata?: Prisma.InputJsonValue;
    },
    db: Db = prisma,
  ) {
    return db.auditLog.create({ data });
  },

  async list(filters: AuditListFilters) {
    const where: Prisma.AuditLogWhereInput = {
      ...(filters.action ? { action: filters.action } : {}),
      ...(filters.actorId ? { userId: filters.actorId } : {}),
      ...(filters.entityType ? { entityType: filters.entityType } : {}),
      ...(filters.entityId ? { entityId: filters.entityId } : {}),
      ...(filters.fromDate || filters.toDateExclusive
        ? {
            createdAt: {
              ...(filters.fromDate ? { gte: filters.fromDate } : {}),
              ...(filters.toDateExclusive ? { lt: filters.toDateExclusive } : {}),
            },
          }
        : {}),
    };

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: {
          user: { select: { id: true, email: true, name: true } },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (filters.page - 1) * filters.pageSize,
        take: filters.pageSize,
      }),
      prisma.auditLog.count({ where }),
    ]);

    return { logs, total };
  },
};
