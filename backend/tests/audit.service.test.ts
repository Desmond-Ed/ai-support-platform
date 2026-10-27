import { beforeEach, describe, expect, it, vi } from 'vitest';

const create = vi.hoisted(() => vi.fn());

vi.mock('../src/repositories/AuditLogRepository.js', () => ({
  AuditLogRepository: { create, list: vi.fn() },
}));

import { AuditService } from '../src/services/audit.service.js';

beforeEach(() => {
  vi.resetAllMocks();
  create.mockResolvedValue({ id: 'audit-1' });
});

describe('AuditService metadata validation', () => {
  it('persists allowed scalar metadata and injects actor type', async () => {
    await AuditService.record({
      actorId: 'admin-1',
      action: 'TICKET_STATUS_CHANGED',
      entityType: 'Ticket',
      entityId: 'ticket-1',
      metadata: {
        previousStatus: 'OPEN',
        newStatus: 'IN_PROGRESS',
        resolvedAt: null,
      },
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: {
          previousStatus: 'OPEN',
          newStatus: 'IN_PROGRESS',
          resolvedAt: null,
          actorType: 'USER',
        },
      }),
      expect.anything(),
    );
  });

  it('rejects nested values even under an allowed key', async () => {
    await expect(
      AuditService.record({
        actorId: 'admin-1',
        action: 'TICKET_ASSIGNED',
        entityType: 'Ticket',
        entityId: 'ticket-1',
        metadata: { ticketId: { secret: 'not safe' } },
      }),
    ).rejects.toThrow('Unsafe audit metadata value: ticketId');
    expect(create).not.toHaveBeenCalled();
  });

  it('rejects invalid numeric values', async () => {
    await expect(
      AuditService.record({
        actorId: null,
        action: 'KNOWLEDGE_INGESTION_RETRY_ENQUEUE_FAILED',
        entityType: 'KnowledgeDocument',
        entityId: 'doc-1',
        metadata: { ingestionAttempt: -1 },
        system: true,
      }),
    ).rejects.toThrow('Unsafe audit metadata value: ingestionAttempt');
    expect(create).not.toHaveBeenCalled();
  });
});
