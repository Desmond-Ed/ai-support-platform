import type { Role } from "../generated/prisma/client.js";

export type AccessTokenPayload = {
  sub: string;
  role: Role;
};

export type RefreshTokenPayload = {
  sub: string;
  jti: string;
};

export interface AuthenticatedUser {
  id: string;
  role: Role;
}

declare module "express-serve-static-core" {
  interface Request {
    user?: AuthenticatedUser;
  }
}