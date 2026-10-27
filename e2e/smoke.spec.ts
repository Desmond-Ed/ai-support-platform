import { expect, test } from '@playwright/test';
import { BACKEND_URL } from './support/config';

test('frontend loads and backend health is reachable', async ({ page, request }) => {
  const health = await request.get(`${BACKEND_URL}/api/health`);
  expect(health.ok()).toBeTruthy();

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Command center' })).toBeVisible();
});
