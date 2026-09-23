import { KnowledgeDocumentRepository } from '../repositories/KnowledgeDocumentRepository.js';
import { knowledgeIngestionQueue } from '../queues/knowledgeQueue.js';
import type { KnowledgeDocument } from '../generated/prisma/client.js';

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

    await knowledgeIngestionQueue.add(
      'ingest-document',
      { documentId: document.id },
      { jobId: `knowledge-document:${document.id}` },
    );

    return document;
  },
};
