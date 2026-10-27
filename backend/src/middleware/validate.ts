import type { RequestHandler } from 'express';
import type { ZodType } from 'zod';

export function validateBody(schema: ZodType): RequestHandler {
  return function validateBodyMiddleware(req, _res, next) {
    req.body = schema.parse(req.body);
    next();
  };
}

export function validateQuery(schema: ZodType): RequestHandler {
  return function validateQueryMiddleware(req, _res, next) {
    const parsed = schema.parse(req.query);
    Object.defineProperty(req, 'query', {
      value: parsed,
      writable: true,
      configurable: true,
      enumerable: true,
    });
    next();
  };
}