import { describe, expect, it, vi } from 'vitest';

const verifyAccessToken = vi.hoisted(() => vi.fn());

vi.mock('../src/utils/jwt.js', () => ({ verifyAccessToken }));

import { authenticateSocket, socketRooms } from '../src/sockets/index.js';

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
});