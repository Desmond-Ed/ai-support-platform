import { prisma } from '../config/db.js';
import type { Prisma, Role, User } from '../generated/prisma/client.js';

/**
 * Thin Prisma wrapper for User. No business logic, no AppError — a
 * missing user is `null`, not an exception. The service layer decides
 * whether null means 401, 404, or "go ahead and create".
 *
 * Every method takes an optional `db` (defaults to the shared `prisma`
 * client) so the auth service can pass a `Prisma.TransactionClient`
 * instead and compose this with RefreshTokenRepository inside one
 * atomic `prisma.$transaction(...)`.
 */
type Db = Prisma.TransactionClient | typeof prisma;

export const UserRepository = {
  async findByEmail(email: string, db: Db = prisma): Promise<User | null> {
    return db.user.findUnique({ where: { email } });
  },

  async findById(id: string, db: Db = prisma): Promise<User | null> {
    return db.user.findUnique({ where: { id } });
  },

  async updateName(id: string, name: string, db: Db = prisma): Promise<User> {
    return db.user.update({ where: { id }, data: { name } });
  },

  async existsByEmail(email: string, db: Db = prisma): Promise<boolean> {
    const count = await db.user.count({ where: { email } });
    return count > 0;
  },

  // `role` is optional and defaults to CUSTOMER, mirroring the schema's
  // own `@default(CUSTOMER)`. The public register endpoint should call
  // this with no `role` at all — never forward a client-supplied value
  // here. Seed scripts / future admin-creation paths pass it explicitly
  // for AGENT/ADMIN.
  async create(
    data: { email: string; passwordHash: string; name: string; role?: Role },
    db: Db = prisma,
  ): Promise<User> {
    return db.user.create({
      data: { ...data, role: data.role ?? 'CUSTOMER' },
    });
  },
};