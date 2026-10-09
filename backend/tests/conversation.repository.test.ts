import { beforeEach, describe, expect, it, vi } from 'vitest';

const prisma = vi.hoisted(() => ({
  message: { findMany: vi.fn() },
}));

vi.mock('../src/config/db.js', () => ({ prisma }));

import { ConversationRepository } from '../src/repositories/ConversationRepository.js';

beforeEach(() => {
  vi.resetAllMocks();
});

describe('ConversationRepository', () => {
  it('returns the latest 200 conversation messages in oldest-first order', async () => {
    const newestFirst = [
      { id: 'message-3', conversationId: 'conversation-1' },
      { id: 'message-2', conversationId: 'conversation-1' },
      { id: 'message-1', conversationId: 'conversation-1' },
    ];
    prisma.message.findMany.mockResolvedValue(newestFirst);

    const result = await ConversationRepository.listMessages('conversation-1');

    expect(result).toEqual([
      { id: 'message-1', conversationId: 'conversation-1' },
      { id: 'message-2', conversationId: 'conversation-1' },
      { id: 'message-3', conversationId: 'conversation-1' },
    ]);
    expect(prisma.message.findMany).toHaveBeenCalledWith({
      where: { conversationId: 'conversation-1' },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  });
});