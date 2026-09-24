import { expect, test } from '@playwright/test';

test('frontend loads and backend health is reachable', async ({ page, request }) => {
  const health = await request.get(`${process.env.BACKEND_URL || 'http://localhost:4000'}/api/health`);
  expect(health.ok()).toBeTruthy();

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Command center' })).toBeVisible();
});