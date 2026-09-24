import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.ts',
  timeout: 30_000,
  use: {
    baseURL: process.env.FRONTEND_URL || 'http://localhost:5173',
    trace: 'retain-on-failure',
  },
});