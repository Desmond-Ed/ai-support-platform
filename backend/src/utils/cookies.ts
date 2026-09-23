import type { CookieOptions, Response } from 'express';
import { env } from '../config/env.js';
import { getExpiryDate } from './duration.js';

export const REFRESH_TOKEN_COOKIE = 'refreshToken';

function cookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/auth',
  };
}

export function setRefreshTokenCookie(res: Response, refreshToken: string): void {
  res.cookie(REFRESH_TOKEN_COOKIE, refreshToken, {
    ...cookieOptions(),
    expires: getExpiryDate(env.JWT_REFRESH_EXPIRES_IN),
  });
}

export function clearRefreshTokenCookie(res: Response): void {
  res.clearCookie(REFRESH_TOKEN_COOKIE, cookieOptions());
}