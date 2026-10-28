import { prisma } from '../config/db.js';
import type {
  KnowledgeDocumentStatus,
  KnowledgeModerationStatus,
} from '../generated/prisma/client.js';
import {
  getKnowledgeIngestionJobState,
  knowledgeIngestionJobId,
  knowledgeIngestionJobOptions,
  knowledgeIngestionQueue,
} from '../queues/knowledgeQueue.js';
import {
  KnowledgeDocumentRepository,
  type KnowledgeAdminFilters,
} from '../repositories/KnowledgeDocumentRepository.js';
import { AppError } from '../utils/AppError.js';
import { logger } from '../utils/logger.js';
import type { AuditAction } from '../constants/audit.js';
import { AuditService } from './audit.service.js';

export type ModerationAction = 'APPROVE' | 'REJECT' | 'ARCHIVE' | 'RESTORE';

export interface ModerationInput {
  action: ModerationAction;
  expectedVersion: number;
  reason?: string;
}

export interface KnowledgeListQuery {
  status?: KnowledgeDocumentStatus;
  moderationStatus?: KnowledgeModerationStatus;
  search?: string;
  page?: number;
  pageSize?: number;
}

const ALLOWED_TRANSITIONS: Record<
  KnowledgeModerationStatus,
  Partial<Record<ModerationAction, KnowledgeModerationStatus>>
> = {
  PENDING_REVIEW: {
    APPROVE: 'APPROVED',
    REJECT: 'REJECTED',
    ARCHIVE: 'ARCHIVED',
  },
  APPROVED: {
    REJECT: 'REJECTED',
    ARCHIVE: 'ARCHIVED',
  },
  REJECTED: {
    ARCHIVE: 'ARCHIVED',
    RESTORE: 'PENDING_REVIEW',
  },
  ARCHIVED: {
    RESTORE: 'PENDING_REVIEW',
  },
};

const AUDIT_ACTION_BY_MODERATION: Record<ModerationAction, AuditAction> = {
  APPROVE: 'KNOWLEDGE_APPROVED',
  REJECT: 'KNOWLEDGE_REJECTED',
  ARCHIVE: 'KNOWLEDGE_ARCHIVED',
  RESTORE: 'KNOWLEDGE_RESTORED',
};

function conflict(message: string): never {
  throw new AppError(message, 409);
}

export const KnowledgeModerationService = {
  async list(query: KnowledgeListQuery) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const filters: KnowledgeAdminFilters = {
      ingestionStatus: query.status,
      moderationStatus: query.moderationStatus,
      search: query.search,
      page,
      pageSize,
    };
    const { documents, total } = await KnowledgeDocumentRepository.findAdminPage(filters);
    return {
      documents,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  },

  async detail(documentId: string) {
    const document = await KnowledgeDocumentRepository.findDetail(documentId);
    if (!document) throw new AppError('Knowledge document not found', 404);
    return document;
  },

  async moderate(documentId: string, input: ModerationInput, actorId: string) {
    return prisma.$transaction(async (tx) => {
      const document = await KnowledgeDocumentRepository.findById(documentId, tx);
      if (!document) throw new AppError('Knowledge document not found', 404);

      if (document.moderationVersion !== input.expectedVersion) {
        conflict('Moderation state changed; refresh the document before retrying');
      }

      const nextStatus = ALLOWED_TRANSITIONS[document.moderationStatus][input.action];
      if (!nextStatus) {
        conflict(
          `Cannot ${input.action.toLowerCase()} a document that is ${document.moderationStatus}`,
        );
      }

      if (input.action === 'APPROVE' && document.status !== 'READY') {
        conflict('Only successfully ingested documents can be approved');
      }

      const reason = input.action === 'REJECT' ? input.reason?.trim() : null;
      if (input.action === 'REJECT' && !reason) {
        throw new AppError('A moderation reason is required to reject a document', 400);
      }

      const now = new Date();
      const update = await tx.knowledgeDocument.updateMany({
        where: {
          id: documentId,
          moderationVersion: input.expectedVersion,
          moderationStatus: document.moderationStatus,
        },
        data: {
          moderationStatus: nextStatus,
          moderationReason: reason,
          moderatedById: actorId,
          moderatedAt: now,
          moderationVersion: { increment: 1 },
        },
      });

      if (update.count !== 1) {
        conflict('Moderation state changed; refresh the document before retrying');
      }

      const updated = await tx.knowledgeDocument.findUniqueOrThrow({ where: { id: documentId } });

      await AuditService.record(
        {
          actorId,
          action: AUDIT_ACTION_BY_MODERATION[input.action],
          entityType: 'KnowledgeDocument',
          entityId: documentId,
          metadata: {
            previousModerationStatus: document.moderationStatus,
            newModerationStatus: nextStatus,
            ingestionStatus: document.status,
            ...(reason ? { reason } : {}),
          },
        },
        tx,
      );

      return updated;
    });
  },

  async retryIngestion(
    documentId: string,
    actorId: string,
    expectedVersion?: number,
  ): Promise<{ document: Awaited<ReturnType<typeof KnowledgeDocumentRepository.findById>>; jobId: string }> {
    const existing = await KnowledgeDocumentRepository.findById(documentId);
    if (!existing) throw new AppError('Knowledge document not found', 404);
    if (typeof expectedVersion === 'number' && existing.moderationVersion !== expectedVersion) {
      conflict('Moderation state changed; refresh the document before retrying');
    }
    if (existing.status !== 'FAILED') {
      conflict(
        existing.status === 'PENDING' || existing.status === 'PROCESSING'
          ? 'Ingestion is already active for this document'
          : 'Only failed ingestion can be retried',
      );
    }

    const currentJobId = knowledgeIngestionJobId(documentId, existing.ingestionAttempt);
    const currentJobState = await getKnowledgeIngestionJobState(currentJobId);
    if (
      currentJobState === 'active' ||
      currentJobState === 'waiting' ||
      currentJobState === 'delayed'
    ) {
      conflict('Ingestion is already active for this document');
    }

    const { document, jobId } = await prisma.$transaction(async (tx) => {
      const claim = await KnowledgeDocumentRepository.claimIngestionRetry(
        documentId,
        expectedVersion,
        tx,
      );
      if (claim.count !== 1) {
        conflict('Ingestion state changed; refresh the document before retrying');
      }

      const updated = await tx.knowledgeDocument.findUniqueOrThrow({ where: { id: documentId } });
      const nextJobId = knowledgeIngestionJobId(documentId, updated.ingestionAttempt);

      await AuditService.record(
        {
          actorId,
          action: 'KNOWLEDGE_INGESTION_RETRY_REQUESTED',
          entityType: 'KnowledgeDocument',
          entityId: documentId,
          metadata: {
            previousStatus: 'FAILED',
            newStatus: 'PENDING',
            ingestionStatus: 'PENDING',
            ingestionAttempt: updated.ingestionAttempt,
            jobId: nextJobId,
          },
        },
        tx,
      );

      return { document: updated, jobId: nextJobId };
    });

    try {
      await knowledgeIngestionQueue.add(
        'ingest-document',
        { documentId },
        { jobId, ...knowledgeIngestionJobOptions },
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Knowledge ingestion retry enqueue failed', {
        documentId,
        jobId,
        error: errorMessage,
      });

      try {
        await prisma.$transaction(async (tx) => {
          const failed = await KnowledgeDocumentRepository.markRetryEnqueueFailed(
            documentId,
            document.ingestionAttempt,
            errorMessage,
            tx,
          );
          if (failed.count === 1) {
            await AuditService.record(
              {
                actorId,
                action: 'KNOWLEDGE_INGESTION_RETRY_ENQUEUE_FAILED',
                entityType: 'KnowledgeDocument',
                entityId: documentId,
                metadata: {
                  ingestionStatus: 'FAILED',
                  ingestionAttempt: document.ingestionAttempt,
                  jobId,
                },
              },
              tx,
            );
          }
        });
      } catch (updateError) {
        logger.error('Failed to restore failed ingestion state', {
          documentId,
          error: updateError instanceof Error ? updateError.message : String(updateError),
        });
      }

      throw new AppError('Ingestion queue unavailable', 503);
    }

    return { document, jobId };
  },
};
