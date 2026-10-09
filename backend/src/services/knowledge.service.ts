import { KnowledgeDocumentRepository } from '../repositories/KnowledgeDocumentRepository.js';
import { knowledgeIngestionQueue } from '../queues/knowledgeQueue.js';
import type { KnowledgeDocument } from '../generated/prisma/client.js';
import { AppError } from '../utils/AppError.js';
import { logger } from '../utils/logger.js';

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
    const document = await KnowledgeDocumentRepository.create({
      title: input.title,
      content: input.content,
      sourceType: input.sourceType,
      uploadedById: input.uploadedById,
      status: 'PENDING',
    });

    try {
      await knowledgeIngestionQueue.add(
        'ingest-document',
        { documentId: document.id },
        { jobId: `knowledge-document-${document.id}` },
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Knowledge ingestion enqueue failed', {
        documentId: document.id,
        error: errorMessage,
      });
      try {
        await KnowledgeDocumentRepository.markFailed(document.id, errorMessage);
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
