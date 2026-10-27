import { defineConfig } from 'vitest/config';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://postgres:postgres@localhost:5433/ai_support_platform_e2e';
process.env.JWT_ACCESS_SECRET ||= 'integration-access-secret';
process.env.JWT_REFRESH_SECRET ||= 'integration-refresh-secret';
process.env.REDIS_URL ||= 'redis://localhost:6381';
process.env.AI_SERVICE_URL ||= 'http://localhost:8001';
process.env.CORS_ORIGIN ||= 'http://localhost:5174';

export default defineConfig({
  test: {
    include: ['tests/integration/**/*.integration.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
