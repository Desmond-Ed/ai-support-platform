import { beforeEach, describe, expect, it, vi } from 'vitest';

const knowledgeRepository = vi.hoisted(() => ({
  findManyByUploader: vi.fn(),
  findManyPending: vi.fn(),
  create: vi.fn(),
}));
const add = vi.hoisted(() => vi.fn());

vi.mock('../src/repositories/KnowledgeDocumentRepository.js', () => ({
  KnowledgeDocumentRepository: knowledgeRepository,
}));
vi.mock('../src/queues/knowledgeQueue.js', () => ({
  knowledgeIngestionQueue: { add },
}));

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
      { jobId: 'knowledge-document:doc-2' },
    );
  });
});
