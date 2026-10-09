import { beforeEach, describe, expect, it, vi } from 'vitest';

const knowledgeRepository = vi.hoisted(() => ({
  findManyByUploader: vi.fn(),
  findManyPending: vi.fn(),
  create: vi.fn(),
  markFailed: vi.fn(),
}));
const add = vi.hoisted(() => vi.fn());
const logger = vi.hoisted(() => ({ error: vi.fn() }));

vi.mock('../src/repositories/KnowledgeDocumentRepository.js', () => ({
  KnowledgeDocumentRepository: knowledgeRepository,
}));
vi.mock('../src/queues/knowledgeQueue.js', () => ({
  knowledgeIngestionQueue: { add },
}));
vi.mock('../src/utils/logger.js', () => ({ logger }));

import { KnowledgeService } from '../src/services/knowledge.service.js';

beforeEach(() => {
  vi.resetAllMocks();
});

describe('KnowledgeService', () => {
  it('lists documents uploaded by the user', async () => {
    const docs = [{ id: 'doc-1', title: 'Refund policy', uploadedById: 'user-1' }];
    knowledgeRepository.findManyByUploader.mockResolvedValue(docs);

    const result = await KnowledgeService.listForUser('user-1');

    expect(result).toBe(docs);
    expect(knowledgeRepository.findManyByUploader).toHaveBeenCalledWith('user-1');
  });

  it('creates a pending document record for ingestion', async () => {
    const document = {
      id: 'doc-2',
      title: 'Shipping policy',
      sourceType: 'UPLOAD',
      uploadedById: 'user-1',
      status: 'PENDING',
    };
    knowledgeRepository.create.mockResolvedValue(document);

    const result = await KnowledgeService.createDocument({
      title: 'Shipping policy',
      content: 'Shipping takes 3-5 business days.',
      sourceType: 'UPLOAD',
      uploadedById: 'user-1',
    });

    expect(result).toEqual(document);
    expect(knowledgeRepository.create).toHaveBeenCalledWith({
      title: 'Shipping policy',
      content: 'Shipping takes 3-5 business days.',
      sourceType: 'UPLOAD',
      uploadedById: 'user-1',
      status: 'PENDING',
    });
    expect(add).toHaveBeenCalledWith(
      'ingest-document',
      { documentId: 'doc-2' },
      { jobId: 'knowledge-document-doc-2' },
    );
    expect(add.mock.calls[0][2].jobId).not.toContain(':');
  });

  it('marks the document failed and returns 503 when enqueue fails', async () => {
    const document = {
      id: 'doc-3',
      title: 'Account policy',
      sourceType: 'MANUAL',
      uploadedById: 'user-1',
      status: 'PENDING',
    };
    const queueError = new Error('Redis unavailable');
    knowledgeRepository.create.mockResolvedValue(document);
    knowledgeRepository.markFailed.mockResolvedValue({
      ...document,
      status: 'FAILED',
      errorMessage: queueError.message,
    });
    add.mockRejectedValue(queueError);

    await expect(
      KnowledgeService.createDocument({
        title: 'Account policy',
        content: 'Password resets use a verified email.',
        sourceType: 'MANUAL',
        uploadedById: 'user-1',
      }),
    ).rejects.toMatchObject({ statusCode: 503, message: 'Ingestion queue unavailable' });

    expect(knowledgeRepository.markFailed).toHaveBeenCalledWith('doc-3', 'Redis unavailable');
    expect(logger.error).toHaveBeenCalledWith('Knowledge ingestion enqueue failed', {
      documentId: 'doc-3',
      error: 'Redis unavailable',
    });
  });
});
