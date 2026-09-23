import { randomUUID } from 'node:crypto';
import bcrypt from 'bcrypt';
import { prisma } from '../config/db.js';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';
import { logger } from '../utils/logger.js';
import { getExpiryDate } from '../utils/duration.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import { hashToken, signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/jwt.js';
import { UserRepository } from '../repositories/UserRepository.js';
import { RefreshTokenRepository } from '../repositories/RefreshTokenRepository.js';
import type { Prisma, User } from '../generated/prisma/client.js';

type Db = Prisma.TransactionClient | typeof prisma;

export interface RegisterInput {
  email: string;
  password: string;
  name: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export type SafeUser = Omit<User, 'passwordHash'>;

export interface AuthResult {
  user: SafeUser;
  tokens: AuthTokens;
}

function sanitizeUser(user: User): SafeUser {
  const { passwordHash, ...safe } = user;
  void passwordHash;
  return safe;
}

/**
 * Precomputed once at module load, not per request. Used to run a real
 * bcrypt.compare even when the email doesn't exist, so `login` takes
 * roughly the same time either way — otherwise "user not found" (no
 * hashing) vs "user found, password wrong" (one bcrypt compare) is a
 * timing side-channel that lets an attacker enumerate registered
 * emails by measuring response latency.
 */
const DUMMY_PASSWORD_HASH = bcrypt.hashSync('timing-safety-placeholder', 12);

/**
 * Signs a fresh access+refresh pair for a user and persists the refresh
 * token's hash. Takes an optional `db` so `refresh()` can run the
 * revoke-old + create-new pair inside one `prisma.$transaction(...)` —
 * see the rotation comment there for why that matters.
 */
async function issueTokenPair(user: User, db: Db = prisma): Promise<AuthTokens> {
  const jti = randomUUID();
  const accessToken = signAccessToken({ sub: user.id, role: user.role });
  const refreshToken = signRefreshToken({ sub: user.id, jti });

  await RefreshTokenRepository.create(
    {
      tokenHash: hashToken(refreshToken),
      userId: user.id,
      expiresAt: getExpiryDate(env.JWT_REFRESH_EXPIRES_IN),
    },
    db,
  );

  return { accessToken, refreshToken };
}

export const AuthService = {
  /**
   * Registration endpoint's `role` is never a parameter here — this
   * always creates a CUSTOMER. That's deliberate per the Phase 3 plan:
   * "self-registration is CUSTOMER-only" is enforced by this function's
   * signature not accepting a role at all, not by validation that could
   * be bypassed or forgotten later.
   */
  async register(input: RegisterInput): Promise<AuthResult> {
    if (await UserRepository.existsByEmail(input.email)) {
      throw new AppError('Email already registered', 409);
    }

    const passwordHash = await hashPassword(input.password);

    let user: User;
    try {
      user = await UserRepository.create({
        email: input.email,
        passwordHash,
        name: input.name,
      });
    } catch (err) {
      // Race condition guard: two concurrent registrations for the same
      // email can both pass the existsByEmail check above. Prisma's
      // unique constraint on User.email is the real guarantee; this just
      // translates that DB-level failure into the same 409 the
      // pre-check gives, instead of leaking a raw Prisma error.
      if (err && typeof err === 'object' && 'code' in err && err.code === 'P2002') {
        throw new AppError('Email already registered', 409);
      }
      throw err;
    }

    logger.info('User registered', { userId: user.id });

    const tokens = await issueTokenPair(user);
    return { user: sanitizeUser(user), tokens };
  },

  async login(input: LoginInput): Promise<AuthResult> {
    const user = await UserRepository.findByEmail(input.email);

    if (!user) {
      await verifyPassword(input.password, DUMMY_PASSWORD_HASH); // timing-safety, see above
      throw new AppError('Invalid email or password', 401);
    }

    const passwordValid = await verifyPassword(input.password, user.passwordHash);
    if (!passwordValid) {
      throw new AppError('Invalid email or password', 401);
    }

    if (!user.isActive) {
      throw new AppError('This account has been disabled', 403);
    }

    logger.info('User logged in', { userId: user.id });

    const tokens = await issueTokenPair(user);
    return { user: sanitizeUser(user), tokens };
  },

  /**
   * Verifies the presented refresh token, detects reuse of an already-
   * rotated token, and — if everything checks out — rotates it: issues
   * a brand new pair and revokes the old row. Create-new and revoke-old
  * happen inside one `prisma.$transaction`, and revocation is conditional
  * so concurrent requests cannot rotate the same active token twice.
   */
  async refresh(rawRefreshToken: string): Promise<AuthTokens> {
    verifyRefreshToken(rawRefreshToken); // throws 401 on bad signature / expired exp claim

    const tokenHash = hashToken(rawRefreshToken);
    const row = await RefreshTokenRepository.findByTokenHash(tokenHash);

    if (!row) {
      // Not in the DB at all — forged, or the DB was reset. Nothing to
      // revoke; just reject.
      throw new AppError('Invalid refresh token', 401);
    }

    if (row.revokedAt) {
      // This exact token was already rotated away once. Someone
      // presenting it again means it leaked — assume the whole session
      // family is compromised and kill every active token for this
      // user, not just this one.
      logger.warn('Refresh token reuse detected', { userId: row.userId, tokenId: row.id });
      await RefreshTokenRepository.revokeAllForUser(row.userId);
      throw new AppError('Refresh token reuse detected — all sessions revoked', 401);
    }

    if (row.expiresAt < new Date()) {
      // Belt-and-suspenders: jwt.verify already rejects an expired
      // token's exp claim above, so this only matters if the DB row and
      // the token's own expiry ever drift.
      throw new AppError('Refresh token expired', 401);
    }

    const user = await UserRepository.findById(row.userId);
    if (!user || !user.isActive) {
      throw new AppError('Account no longer available', 401);
    }

    return prisma.$transaction(async (tx) => {
      const revoked = await RefreshTokenRepository.revokeIfActive(row.id, tx);
      if (!revoked) {
        throw new AppError('Refresh token already used', 401);
      }
      return issueTokenPair(user, tx);
    });
  },

  /** Revokes just the one session tied to this refresh token. Idempotent
   * and silent on a missing/already-revoked row — logout should never
   * leak whether a token existed. */
  async logout(rawRefreshToken: string): Promise<void> {
    const tokenHash = hashToken(rawRefreshToken);
    const row = await RefreshTokenRepository.findByTokenHash(tokenHash);
    if (row && !row.revokedAt) {
      await RefreshTokenRepository.revoke(row.id);
    }
  },

  /** Logout-all-devices: revoke every active refresh token for a user. */
  async logoutAll(userId: string): Promise<void> {
    await RefreshTokenRepository.revokeAllForUser(userId);
  },
};