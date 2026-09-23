import { KnowledgeDocumentRepository } from '../repositories/KnowledgeDocumentRepository.js';
import type { KnowledgeDocument } from '../generated/prisma/client.js';

export interface CreateKnowledgeDocumentInput {
  title: string;
  sourceType: string;
  uploadedById: string;
}

export const KnowledgeService = {
  async listForUser(uploadedById: string): Promise<KnowledgeDocument[]> {
    return KnowledgeDocumentRepository.findManyByUploader(uploadedById);
  },

  async createDocument(input: CreateKnowledgeDocumentInput): Promise<KnowledgeDocument> {
    return KnowledgeDocumentRepository.create({
      title: input.title,
      sourceType: input.sourceType,
      uploadedById: input.uploadedById,
      status: 'PENDING',
    });
  },
};
