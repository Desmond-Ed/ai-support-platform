import { prisma } from '../config/db.js';
import type { KnowledgeDocument, Prisma } from '../generated/prisma/client.js';

type Db = Prisma.TransactionClient | typeof prisma;

export const KnowledgeDocumentRepository = {
  async findMany(db: Db = prisma): Promise<KnowledgeDocument[]> {
    return db.knowledgeDocument.findMany({ orderBy: { createdAt: 'desc' } });
  },

  async findManyByUploader(uploadedById: string, db: Db = prisma): Promise<KnowledgeDocument[]> {
    return db.knowledgeDocument.findMany({
      where: { uploadedById },
      orderBy: { createdAt: 'desc' },
    });
  },

  async findManyPending(db: Db = prisma): Promise<KnowledgeDocument[]> {
    return db.knowledgeDocument.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
    });
  },

  async create(
    data: {
      title: string;
      content: string;
      uploadedById: string;
      sourceType: string;
      status?: 'PENDING' | 'PROCESSING' | 'READY' | 'FAILED';
    },
    db: Db = prisma,
  ): Promise<KnowledgeDocument> {
    return db.knowledgeDocument.create({
      data: {
        title: data.title,
        content: data.content,
        uploadedById: data.uploadedById,
        sourceType: data.sourceType,
        status: data.status ?? 'PENDING',
      },
    });
  },
};
