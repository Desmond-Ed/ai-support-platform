import { prisma } from '../config/db.js';
import type { Prisma } from '../generated/prisma/client.js';
import { AuditLogRepository, type AuditListFilters } from '../repositories/AuditLogRepository.js';
import type { AuditAction } from '../constants/audit.js';
import { resolveDateRange } from '../utils/dateRange.js';

type Db = Prisma.TransactionClient | typeof prisma;

const SAFE_METADATA_KEYS = new Set([
  'actorType',
  'previousRole',
  'newRole',
  'previousIsActive',
  'newIsActive',
  'previousStatus',
  'newStatus',
  'previousAgentId',
  'newAgentId',
  'previousModerationStatus',
  'newModerationStatus',
  'ticketId',
  'conversationId',
  'documentId',
  'title',
  'sourceType',
  'reason',
  'resolvedAt',
  'ingestionStatus',
  'ingestionAttempt',
  'jobId',
]);

const BOOLEAN_METADATA_KEYS = new Set(['previousIsActive', 'newIsActive']);
const NUMBER_METADATA_KEYS = new Set(['ingestionAttempt']);
const NULLABLE_METADATA_KEYS = new Set([
  'previousAgentId',
  'newAgentId',
  'reason',
  'resolvedAt',
]);

export interface AuditRecordInput {
  actorId: string | null;
  action: AuditAction;
  entityType: string;
  entityId: string;
  metadata: Record<string, unknown>;
  system?: boolean;
}

export interface AuditQuery {
  action?: string;
  actorId?: string;
  entityType?: string;
  entityId?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

function safeMetadata(input: Record<string, unknown>, system: boolean): Prisma.InputJsonValue {
  for (const [key, value] of Object.entries(input)) {
    if (!SAFE_METADATA_KEYS.has(key)) {
      throw new Error(`Unsafe audit metadata key: ${key}`);
    }

    if (BOOLEAN_METADATA_KEYS.has(key)) {
      if (typeof value !== 'boolean') throw new Error(`Unsafe audit metadata value: ${key}`);
      continue;
    }

    if (NUMBER_METADATA_KEYS.has(key)) {
      if (!Number.isSafeInteger(value) || (value as number) < 0) {
        throw new Error(`Unsafe audit metadata value: ${key}`);
      }
      continue;
    }

    if (value === null && NULLABLE_METADATA_KEYS.has(key)) continue;
    if (typeof value !== 'string' || value.length === 0 || value.length > 500) {
      throw new Error(`Unsafe audit metadata value: ${key}`);
    }
  }

  return JSON.parse(
    JSON.stringify({ ...input, actorType: system ? 'SYSTEM' : 'USER' }),
  ) as Prisma.InputJsonValue;
}

export const AuditService = {
  async record(input: AuditRecordInput, db: Db = prisma) {
    return AuditLogRepository.create(
      {
        userId: input.actorId,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        metadata: safeMetadata(input.metadata, Boolean(input.system)),
      },
      db,
    );
  },

  async list(query: AuditQuery) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const dateRange =
      query.from || query.to
        ? resolveDateRange(query.from, query.to, { defaultDays: 30, maxDays: 366 })
        : null;

    const filters: AuditListFilters = {
      action: query.action,
      actorId: query.actorId,
      entityType: query.entityType,
      entityId: query.entityId,
      fromDate: dateRange?.fromDate,
      toDateExclusive: dateRange?.toDateExclusive,
      page,
      pageSize,
    };

    const { logs, total } = await AuditLogRepository.list(filters);
    return {
      logs: logs.map((log) => ({
        id: log.id,
        action: log.action,
        entityType: log.entityType,
        entityId: log.entityId,
        metadata: log.metadata,
        createdAt: log.createdAt,
        actor: log.user,
      })),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  },
};
