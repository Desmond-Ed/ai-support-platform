import { beforeEach, describe, expect, it, vi } from 'vitest';

const knowledgeRepository = vi.hoisted(() => ({
  findManyByUploader: vi.fn(),
  create: vi.fn(),
  markRetryEnqueueFailed: vi.fn(),
}));
const add = vi.hoisted(() => vi.fn());
const logger = vi.hoisted(() => ({ error: vi.fn() }));
const auditRecord = vi.hoisted(() => vi.fn());
const transactionClient = vi.hoisted(() => ({}));
const prisma = vi.hoisted(() => ({ $transaction: vi.fn() }));

vi.mock('../src/repositories/KnowledgeDocumentRepository.js', () => ({
  KnowledgeDocumentRepository: knowledgeRepository,
}));
vi.mock('../src/queues/knowledgeQueue.js', () => ({
  knowledgeIngestionQueue: { add },
  knowledgeIngestionJobId: (documentId: string, attempt: number) =>
    attempt <= 0 ? `knowledge-document-${documentId}` : `knowledge-document-${documentId}-retry-${attempt}`,
}));
vi.mock('../src/utils/logger.js', () => ({ logger }));
vi.mock('../src/services/audit.service.js', () => ({
  AuditService: { record: auditRecord },
}));
vi.mock('../src/config/db.js', () => ({ prisma }));

import { KnowledgeService } from '../src/services/knowledge.service.js';

beforeEach(() => {
  vi.resetAllMocks();
  prisma.$transaction.mockImplementation((callback) => callback(transactionClient));
  auditRecord.mockResolvedValue({ id: 'audit-1' });
});

describe('KnowledgeService', () => {
  it('lists documents uploaded by the user', async () => {
    const docs = [{ id: 'doc-1', title: 'Refund policy', uploadedById: 'user-1' }];
    knowledgeRepository.findManyByUploader.mockResolvedValue(docs);

    const result = await KnowledgeService.listForUser('user-1');

    expect(result).toBe(docs);
    expect(knowledgeRepository.findManyByUploader).toHaveBeenCalledWith('user-1');
  });

  it('creates a pending submission and its audit record in one transaction', async () => {
    const document = {
      id: 'doc-2',
      title: 'Shipping policy',
      sourceType: 'UPLOAD',
      uploadedById: 'user-1',
      status: 'PENDING',
      moderationStatus: 'PENDING_REVIEW',
    };
    knowledgeRepository.create.mockResolvedValue(document);

    const result = await KnowledgeService.createDocument({
      title: 'Shipping policy',
      content: 'Shipping takes 3-5 business days.',
      sourceType: 'UPLOAD',
      uploadedById: 'user-1',
    });

    expect(result).toEqual(document);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(knowledgeRepository.create).toHaveBeenCalledWith(
      {
        title: 'Shipping policy',
        content: 'Shipping takes 3-5 business days.',
        sourceType: 'UPLOAD',
        uploadedById: 'user-1',
        status: 'PENDING',
      },
      transactionClient,
    );
    expect(auditRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'user-1',
        action: 'KNOWLEDGE_SUBMITTED',
        entityType: 'KnowledgeDocument',
        entityId: 'doc-2',
      }),
      transactionClient,
    );
    expect(add).toHaveBeenCalledWith(
      'ingest-document',
      { documentId: 'doc-2' },
      { jobId: 'knowledge-document-doc-2' },
    );
    expect(add.mock.calls[0][2].jobId).not.toContain(':');
  });

  it('conditionally marks the initial attempt failed and audits it when the update applies', async () => {
    const document = {
      id: 'doc-3',
      title: 'Account policy',
      sourceType: 'MANUAL',
      uploadedById: 'user-1',
      status: 'PENDING',
    };
    const queueError = new Error('Redis unavailable');
    knowledgeRepository.create.mockResolvedValue(document);
    knowledgeRepository.markRetryEnqueueFailed.mockResolvedValue({ count: 1 });
    add.mockRejectedValue(queueError);

    await expect(
      KnowledgeService.createDocument({
        title: 'Account policy',
        content: 'Password resets use a verified email.',
        sourceType: 'MANUAL',
        uploadedById: 'user-1',
      }),
    ).rejects.toMatchObject({ statusCode: 503, message: 'Ingestion queue unavailable' });

    expect(knowledgeRepository.markRetryEnqueueFailed).toHaveBeenCalledWith(
      'doc-3',
      0,
      'Redis unavailable',
      transactionClient,
    );
    expect(auditRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'user-1',
        action: 'KNOWLEDGE_INGESTION_ENQUEUE_FAILED',
        entityId: 'doc-3',
        metadata: expect.objectContaining({
          documentId: 'doc-3',
          ingestionStatus: 'FAILED',
          ingestionAttempt: 0,
          jobId: 'knowledge-document-doc-3',
        }),
      }),
      transactionClient,
    );
    expect(logger.error).toHaveBeenCalledWith('Knowledge ingestion enqueue failed', {
      documentId: 'doc-3',
      error: 'Redis unavailable',
    });
  });

  it('skips the failure audit and still returns 503 when the document has progressed', async () => {
    const document = {
      id: 'doc-4',
      title: 'Returns policy',
      sourceType: 'MANUAL',
      uploadedById: 'user-1',
      status: 'PENDING',
    };
    const queueError = new Error('Redis unavailable');
    knowledgeRepository.create.mockResolvedValue(document);
    knowledgeRepository.markRetryEnqueueFailed.mockResolvedValue({ count: 0 });
    add.mockRejectedValue(queueError);

    await expect(
      KnowledgeService.createDocument({
        title: 'Returns policy',
        content: 'Returns are accepted within 30 days.',
        sourceType: 'MANUAL',
        uploadedById: 'user-1',
      }),
    ).rejects.toMatchObject({ statusCode: 503, message: 'Ingestion queue unavailable' });

    expect(knowledgeRepository.markRetryEnqueueFailed).toHaveBeenCalledWith(
      'doc-4',
      0,
      'Redis unavailable',
      transactionClient,
    );
    const failureAudits = auditRecord.mock.calls.filter(
      ([record]) => record.action === 'KNOWLEDGE_INGESTION_ENQUEUE_FAILED',
    );
    expect(failureAudits).toHaveLength(0);
    expect(logger.error).toHaveBeenCalledWith('Knowledge ingestion enqueue failed', {
      documentId: 'doc-4',
      error: 'Redis unavailable',
    });
  });
});
