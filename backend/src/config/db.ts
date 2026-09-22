import { PrismaClient } from '../generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import { env } from './env.js';

// Prisma 7 requires an explicit driver adapter — `new PrismaClient()`
// with no arguments is no longer valid. This is the one shared instance;
// repositories (Phase 3+) should import `prisma` from here rather than
// constructing their own client.
const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });

export const prisma = new PrismaClient({ adapter });