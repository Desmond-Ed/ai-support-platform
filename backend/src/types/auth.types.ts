import type { Role } from '../generated/prisma/client.js';

/** Claims encoded in the short-lived access token. */
export interface AccessTokenPayload {
  sub: string; // user id
  role: Role;
}

/** Claims encoded in the long-lived refresh token. */
export interface RefreshTokenPayload {
  sub: string; // user id
  jti: string; // token id — matches RefreshToken.id, lets us look up/revoke the exact row
}

/** Shape attached to req.user by the `authenticate` middleware. */
export interface AuthenticatedUser {
  id: string;
  role: Role;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}