import { prisma } from '../config/db.js';
import type {
  KnowledgeDocument,
  KnowledgeDocumentStatus,
  KnowledgeModerationStatus,
  Prisma,
} from '../generated/prisma/client.js';

type Db = Prisma.TransactionClient | typeof prisma;

export interface KnowledgeAdminFilters {
  ingestionStatus?: KnowledgeDocumentStatus;
  moderationStatus?: KnowledgeModerationStatus;
  search?: string;
  page: number;
  pageSize: number;
}

const LIST_SELECT = {
  id: true,
  title: true,
  sourceType: true,
  status: true,
  moderationStatus: true,
  moderationReason: true,
  moderationVersion: true,
  ingestionAttempt: true,
  errorMessage: true,
  createdAt: true,
  updatedAt: true,
  moderatedAt: true,
  uploadedBy: { select: { id: true, email: true, name: true } },
  moderatedBy: { select: { id: true, email: true, name: true } },
} satisfies Prisma.KnowledgeDocumentSelect;

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

  async findById(documentId: string, db: Db = prisma): Promise<KnowledgeDocument | null> {
    return db.knowledgeDocument.findUnique({ where: { id: documentId } });
  },

  async findDetail(documentId: string, db: Db = prisma) {
    return db.knowledgeDocument.findUnique({
      where: { id: documentId },
      include: {
        uploadedBy: { select: { id: true, email: true, name: true } },
        moderatedBy: { select: { id: true, email: true, name: true } },
      },
    });
  },

  async findAdminPage(filters: KnowledgeAdminFilters) {
    const where: Prisma.KnowledgeDocumentWhereInput = {
      ...(filters.ingestionStatus ? { status: filters.ingestionStatus } : {}),
      ...(filters.moderationStatus ? { moderationStatus: filters.moderationStatus } : {}),
      ...(filters.search
        ? { title: { contains: filters.search, mode: 'insensitive' as const } }
        : {}),
    };

    const [documents, total] = await Promise.all([
      prisma.knowledgeDocument.findMany({
        where,
        select: LIST_SELECT,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (filters.page - 1) * filters.pageSize,
        take: filters.pageSize,
      }),
      prisma.knowledgeDocument.count({ where }),
    ]);

    return { documents, total };
  },

  async create(
    data: {
      title: string;
      content: string;
      uploadedById: string;
      sourceType: string;
      status?: KnowledgeDocumentStatus;
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
        moderationStatus: 'PENDING_REVIEW',
      },
    });
  },

  async markFailed(
    documentId: string,
    errorMessage: string,
    db: Db = prisma,
  ): Promise<KnowledgeDocument> {
    return db.knowledgeDocument.update({
      where: { id: documentId },
      data: { status: 'FAILED', errorMessage },
    });
  },

  async markIngestionFailedIfUnfinished(
    documentId: string,
    errorMessage: string,
    db: Db = prisma,
  ) {
    return db.knowledgeDocument.updateMany({
      where: {
        id: documentId,
        status: { in: ['PENDING', 'PROCESSING'] },
      },
      data: { status: 'FAILED', errorMessage },
    });
  },

  async claimIngestionRetry(
    documentId: string,
    expectedModerationVersion: number | undefined,
    db: Db = prisma,
  ) {
    return db.knowledgeDocument.updateMany({
      where: {
        id: documentId,
        status: 'FAILED',
        ...(typeof expectedModerationVersion === 'number'
          ? { moderationVersion: expectedModerationVersion }
          : {}),
      },
      data: {
        status: 'PENDING',
        errorMessage: null,
        ingestionAttempt: { increment: 1 },
      },
    });
  },

  async markRetryEnqueueFailed(
    documentId: string,
    ingestionAttempt: number,
    errorMessage: string,
    db: Db = prisma,
  ) {
    return db.knowledgeDocument.updateMany({
      where: { id: documentId, status: 'PENDING', ingestionAttempt },
      data: { status: 'FAILED', errorMessage },
    });
  },
};
