import { describe, expect, it, vi } from 'vitest';

const verifyAccessToken = vi.hoisted(() => vi.fn());
const findFirst = vi.hoisted(() => vi.fn());

vi.mock('../src/utils/jwt.js', () => ({ verifyAccessToken }));
vi.mock('../src/config/db.js', () => ({
  prisma: {
    conversation: { findFirst },
    ticket: { findFirst },
  },
}));

import {
  authenticateSocket,
  canSubscribeToResource,
  emitConversationMessage,
  socketRooms,
} from '../src/sockets/index.js';

function socket(overrides: Record<string, unknown> = {}) {
  return {
    handshake: {
      auth: {},
      headers: {},
      ...overrides,
    },
    data: {},
  } as never;
}

describe('Socket.IO authentication', () => {
  it('rejects a connection without an access token', () => {
    const next = vi.fn();

    authenticateSocket(socket(), next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'Authentication required' }));
    expect(verifyAccessToken).not.toHaveBeenCalled();
  });

  it('accepts an access token from the handshake auth payload', () => {
    const next = vi.fn();
    verifyAccessToken.mockReturnValue({ sub: 'user-1', role: 'CUSTOMER' });
    const client = socket({ auth: { token: 'access-token' } }) as { data: { user?: unknown } };

    authenticateSocket(client as never, next);

    expect(verifyAccessToken).toHaveBeenCalledWith('access-token');
    expect(client.data.user).toEqual({ sub: 'user-1', role: 'CUSTOMER' });
    expect(next).toHaveBeenCalledWith();
  });

  it('provides stable private room names', () => {
    expect(socketRooms.user('user-1')).toBe('user:user-1');
    expect(socketRooms.conversation('conversation-1')).toBe('conversation:conversation-1');
    expect(socketRooms.ticket('ticket-1')).toBe('ticket:ticket-1');
  });

  it('allows a subscribed customer-owned resource', async () => {
    findFirst.mockResolvedValue({ id: 'conversation-1' });

    await expect(
      canSubscribeToResource(
        { sub: 'user-1', role: 'CUSTOMER' },
        { resource: 'conversation', resourceId: 'conversation-1' },
      ),
    ).resolves.toBe(true);
  });

  it('rejects a subscription when the resource is not owned', async () => {
    findFirst.mockResolvedValue(null);
    await expect(
      canSubscribeToResource(
        { sub: 'user-1', role: 'CUSTOMER' },
        { resource: 'ticket', resourceId: 'ticket-1' },
      ),
    ).resolves.toBe(false);
  });

  it('emits a conversation message to the conversation room', () => {
    const io = {
      to: vi.fn().mockReturnThis(),
      emit: vi.fn(),
    } as unknown as Parameters<typeof emitConversationMessage>[0];

    emitConversationMessage(io, 'conversation-1', {
      messageId: 'msg-1',
      conversationId: 'conversation-1',
      senderType: 'CUSTOMER',
      senderId: 'customer-1',
      content: 'hello',
      createdAt: '2026-10-08T00:00:00.000Z',
    });

    expect(io.to).toHaveBeenCalledWith('conversation:conversation-1');
    expect(io.emit).toHaveBeenCalledWith('conversation_message', {
      messageId: 'msg-1',
      conversationId: 'conversation-1',
      senderType: 'CUSTOMER',
      senderId: 'customer-1',
      content: 'hello',
      createdAt: '2026-10-08T00:00:00.000Z',
    });
  });
});