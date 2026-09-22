import jwt, { type SignOptions } from 'jsonwebtoken';
import { createHash } from 'node:crypto';
import { env } from '../config/env.js';
import { AppError } from './AppError.js';
import type { AccessTokenPayload, RefreshTokenPayload } from '../types/auth.types.js';

/**
 * Algorithm is pinned explicitly on both sign AND verify. Never rely on
 * the library default or trust the `alg` header on an incoming token —
 * that's the classic "algorithm confusion" attack surface (e.g. a token
 * signed with `none`, or an RS256-signed token replayed against code
 * that verifies with a public key as if it were an HS256 secret). Pinning
 * on both ends means a token signed any other way is rejected outright,
 * not silently accepted.
 */
const ALGORITHM = 'HS256' as const;

export function signAccessToken(payload: AccessTokenPayload): string {
  const options: SignOptions = {
    algorithm: ALGORITHM,
    expiresIn: env.JWT_ACCESS_EXPIRES_IN as SignOptions['expiresIn'],
  };
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, options);
}

export function signRefreshToken(payload: RefreshTokenPayload): string {
  const options: SignOptions = {
    algorithm: ALGORITHM,
    expiresIn: env.JWT_REFRESH_EXPIRES_IN as SignOptions['expiresIn'],
  };
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, options);
}

/** Narrow, defensive check — jwt.verify's return type is technically `string | JwtPayload`. */
function assertShape<T extends object>(decoded: unknown, requiredKeys: (keyof T)[]): T {
  if (typeof decoded !== 'object' || decoded === null) {
    throw new AppError('Malformed token payload', 401);
  }
  for (const key of requiredKeys) {
    if (!(key in decoded)) {
      throw new AppError('Malformed token payload', 401);
    }
  }
  return decoded as T;
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: [ALGORITHM] });
    return assertShape<AccessTokenPayload>(decoded, ['sub', 'role']);
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError('Invalid or expired access token', 401);
  }
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  try {
    const decoded = jwt.verify(token, env.JWT_REFRESH_SECRET, { algorithms: [ALGORITHM] });
    return assertShape<RefreshTokenPayload>(decoded, ['sub', 'jti']);
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError('Invalid or expired refresh token', 401);
  }
}

/**
 * Refresh tokens are stored hashed (RefreshToken.tokenHash), never raw —
 * same principle as passwords, so a DB leak doesn't hand out usable
 * tokens directly. SHA-256 (not bcrypt) is deliberate here: the refresh
 * token is already a high-entropy signed JWT, not a human-guessable
 * secret, so we don't need bcrypt's slow adaptive cost — we need a fast,
 * deterministic digest so an incoming token can be hashed and looked up
 * by equality on `tokenHash` at refresh time.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}