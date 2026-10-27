import { prisma } from '../config/db.js';
import { KnowledgeDocumentRepository } from '../repositories/KnowledgeDocumentRepository.js';
import { knowledgeIngestionJobId, knowledgeIngestionQueue } from '../queues/knowledgeQueue.js';
import type { KnowledgeDocument } from '../generated/prisma/client.js';
import { AppError } from '../utils/AppError.js';
import { logger } from '../utils/logger.js';
import { AuditService } from './audit.service.js';

export interface CreateKnowledgeDocumentInput {
  title: string;
  content: string;
  sourceType: string;
  uploadedById: string;
}

export const KnowledgeService = {
  async listForUser(uploadedById: string): Promise<KnowledgeDocument[]> {
    return KnowledgeDocumentRepository.findManyByUploader(uploadedById);
  },

  async createDocument(input: CreateKnowledgeDocumentInput): Promise<KnowledgeDocument> {
    const document = await prisma.$transaction(async (tx) => {
      const created = await KnowledgeDocumentRepository.create(
        {
          title: input.title,
          content: input.content,
          sourceType: input.sourceType,
          uploadedById: input.uploadedById,
          status: 'PENDING',
        },
        tx,
      );

      await AuditService.record(
        {
          actorId: input.uploadedById,
          action: 'KNOWLEDGE_SUBMITTED',
          entityType: 'KnowledgeDocument',
          entityId: created.id,
          metadata: {
            title: created.title,
            sourceType: created.sourceType,
            ingestionStatus: created.status,
          },
        },
        tx,
      );

      return created;
    });

    try {
      await knowledgeIngestionQueue.add(
        'ingest-document',
        { documentId: document.id },
        { jobId: knowledgeIngestionJobId(document.id, 0) },
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Knowledge ingestion enqueue failed', {
        documentId: document.id,
        error: errorMessage,
      });
      try {
        await prisma.$transaction(async (tx) => {
          const { count } = await KnowledgeDocumentRepository.markRetryEnqueueFailed(
            document.id,
            0,
            errorMessage,
            tx,
          );
          if (count !== 1) {
            return;
          }
          await AuditService.record(
            {
              actorId: input.uploadedById,
              action: 'KNOWLEDGE_INGESTION_ENQUEUE_FAILED',
              entityType: 'KnowledgeDocument',
              entityId: document.id,
              metadata: {
                documentId: document.id,
                ingestionStatus: 'FAILED',
                ingestionAttempt: 0,
                jobId: knowledgeIngestionJobId(document.id, 0),
              },
            },
            tx,
          );
        });
      } catch (updateError) {
        logger.error('Failed to mark knowledge document as failed', {
          documentId: document.id,
          error: updateError instanceof Error ? updateError.message : String(updateError),
        });
      }
      throw new AppError('Ingestion queue unavailable', 503);
    }

    return document;
  },
};
