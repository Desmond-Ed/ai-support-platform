import { beforeEach, describe, expect, it, vi } from 'vitest';

const prisma = vi.hoisted(() => ({
  ticket: { groupBy: vi.fn() },
  conversation: { count: vi.fn() },
  notification: { count: vi.fn() },
  knowledgeDocument: { groupBy: vi.fn() },
}));

vi.mock('../src/config/db.js', () => ({ prisma }));

import { AnalyticsService } from '../src/services/analytics.service.js';

beforeEach(() => {
  vi.resetAllMocks();
});

describe('AnalyticsService', () => {
  it('returns AI resolution rate as a percentage', async () => {
    prisma.ticket.groupBy.mockResolvedValue([
      { status: 'OPEN', _count: { _all: 5 } },
      { status: 'RESOLVED', _count: { _all: 3 } },
    ]);
    prisma.conversation.count
      .mockResolvedValueOnce(200)
      .mockResolvedValueOnce(50);
    prisma.notification.count.mockResolvedValue(7);
    prisma.knowledgeDocument.groupBy.mockResolvedValue([
      { status: 'READY', _count: { _all: 9 } },
    ]);

    const result = await AnalyticsService.overview();

    expect(result.aiResolutionRate).toBe(25);
  });
});
