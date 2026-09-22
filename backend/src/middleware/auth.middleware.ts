import type { RequestHandler } from 'express';
import { verifyAccessToken } from '../utils/jwt.js';
import { AppError } from '../utils/AppError.js';
import type { Role } from '../generated/prisma/client.js';
import type { AccessTokenPayload } from '../types/auth.types.js';

/**
 * Verifies the `Authorization: Bearer <token>` access token and attaches
 * its payload to `req.user`. Doesn't touch the DB — this only proves the
 * token was signed by us and hasn't expired; it does NOT re-check
 * `User.isActive`. A deactivated user's still-live 15-minute access
 * token stays valid until it naturally expires. If immediate revocation
 * on deactivation ever becomes a requirement, that's a deliberate
 * addition (e.g. a DB check here, or a short-lived denylist) — not
 * something to silently bolt on now.
 */
export const authenticate: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    throw new AppError('Missing or malformed Authorization header', 401);
  }

  const token = header.slice('Bearer '.length).trim();
  if (!token) {
    throw new AppError('Missing or malformed Authorization header', 401);
  }

  const payload: AccessTokenPayload = verifyAccessToken(token);
  req.user = { id: payload.sub, role: payload.role };
  next();
};

/**
 * Role check against the JWT's own `role` claim — not a DB lookup. That
 * claim was set once, at login/refresh time, from `User.role` at that
 * moment. Consequence worth knowing: a role change made via the DB
 * (e.g. promoting a CUSTOMER to AGENT) won't take effect for that user
 * until their current access token expires and they refresh — at most
 * a JWT_ACCESS_EXPIRES_IN (15m) staleness window. That's the tradeoff
 * of a stateless access token and is expected, not a bug.
 *
 * Must run after `authenticate` in the route chain. Usage:
 *   router.get('/admin/x', authenticate, requireRole('ADMIN'), handler)
 */
export function requireRole(...allowedRoles: Role[]): RequestHandler {
  return function roleGuard(req, _res, next) {
    if (!req.user) {
      // Missing req.user here means the route forgot to run
      // `authenticate` first, not that this user lacks permission —
      // 401 (not authenticated), not 403.
      next(new AppError('Not authenticated', 401));
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      next(new AppError('Insufficient permissions', 403));
      return;
    }

    next();
  };
}
