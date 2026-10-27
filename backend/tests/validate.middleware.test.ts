import { describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { validateQuery } from '../src/middleware/validate.js';

describe('validateQuery', () => {
  it('replaces string query values with parsed numbers for downstream handlers', () => {
    const request = { query: { page: '2', pageSize: '100' } } as unknown as Request;
    const next = vi.fn() as NextFunction;
    const middleware = validateQuery(
      z.object({
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(100).default(20),
      }),
    );

    middleware(request, {} as Response, next);

    expect(request.query).toEqual({ page: 2, pageSize: 100 });
    expect(next).toHaveBeenCalledWith();
  });
});
