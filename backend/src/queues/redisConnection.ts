import { Redis } from 'ioredis';
import { env } from '../config/env.js';

// BullMQ requires maxRetriesPerRequest: null on its Redis connection.
export const redisConnection = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
});

// Queue definitions (email/notification dispatch, AI job queue, etc.) are
// added in the phases that need them (Human handoff/tickets, Real-time).
