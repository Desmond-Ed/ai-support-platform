import { prisma } from '../config/db.js';
import type { Prisma, RefreshToken } from '../generated/prisma/client.js';

/**
 * Thin Prisma wrapper for RefreshToken. Note `findByTokenHash` returns
 * the row even if it's revoked or expired — the service layer decides
 * what to do with that. Filtering here would hide the distinction
 * between "token doesn't exist" (probably forged, or DB was wiped) and
 * "token was already revoked" (reuse of a rotated token — the signal a
 * refresh token leaked). The refresh flow needs to tell those apart:
 * the standard response to reuse is revoke-all-for-user + forced
 * re-login, and that's undetectable if this repo pre-filters the row
 * out. (jwt.verify already rejects an expired token on its own, so the
 * expiresAt check here is belt-and-suspenders, but the same principle
 * applies — don't decide in the repository what the service should
 * decide.)
 *
 * Every method takes an optional `db` (defaults to the shared `prisma`
 * client) so the auth service can pass a `Prisma.TransactionClient`
 * instead and run rotation (create the new token + revoke the old one)
 * as one atomic `prisma.$transaction(...)`.
 */

type Db = Prisma.TransactionClient | typeof prisma;

export const RefreshTokenRepository = {
  async create(
    data: { tokenHash: string; userId: string; expiresAt: Date },
    db: Db = prisma,
  ): Promise<RefreshToken> {
    return db.refreshToken.create({ data });
  },

  async findByTokenHash(tokenHash: string, db: Db = prisma): Promise<RefreshToken | null> {
    return db.refreshToken.findUnique({ where: { tokenHash } });
  },

  async revoke(id: string, db: Db = prisma): Promise<void> {
    await db.refreshToken.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
  },

  // Revoke every active token for a user. Called on logout-all, password
  // change, and — critically — on refresh-token reuse detection, where
  // the standard response is "assume the whole family is compromised,
  // kill everything."
  async revokeAllForUser(userId: string, db: Db = prisma): Promise<void> {
    await db.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  },
};