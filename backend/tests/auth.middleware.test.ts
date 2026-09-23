import { describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';

const verifyAccessToken = vi.hoisted(() => vi.fn());

vi.mock('../src/utils/jwt.js', () => ({ verifyAccessToken }));

import { authenticate, requireRole } from '../src/middleware/auth.middleware.js';

function request(overrides: Partial<Request> = {}): Request {
  return {
    headers: {},
    ...overrides,
  } as Request;
}

const response = {} as Response;

describe('auth middleware', () => {
  it('attaches the verified token identity to the request', () => {
    const next = vi.fn() as NextFunction;
    verifyAccessToken.mockReturnValue({ sub: 'user-1', role: 'AGENT' });

    authenticate(request({ headers: { authorization: 'Bearer access-token' } }), response, next);

    expect(next).toHaveBeenCalledOnce();
  });

  it('rejects a missing authorization header', () => {
    const next = vi.fn() as NextFunction;

    expect(() => authenticate(request(), response, next)).toThrow(
      'Missing or malformed Authorization header',
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when role checking runs without authentication', () => {
    const next = vi.fn() as NextFunction;

    requireRole('ADMIN')(request(), response, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
  });

  it('returns 403 when the authenticated role is not allowed', () => {
    const next = vi.fn() as NextFunction;

    requireRole('ADMIN')(
      request({ user: { id: 'user-1', role: 'CUSTOMER' } }),
      response,
      next,
    );

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
  });

  it('continues when the authenticated role is allowed', () => {
    const next = vi.fn() as NextFunction;

    requireRole('AGENT')(
      request({ user: { id: 'user-1', role: 'AGENT' } }),
      response,
      next,
    );

    expect(next).toHaveBeenCalledWith();
  });
});