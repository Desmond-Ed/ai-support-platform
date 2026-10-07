import { expect, test } from '@playwright/test';

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:4000';

const TEST_CUSTOMER = { email: 'customer@example.com', password: 'DevPassword123!' };
const TEST_AGENT = { email: 'agent@example.com', password: 'DevPassword123!' };

async function login(page: any, credentials: { email: string; password: string }) {
  await page.goto(FRONTEND_URL);
  await page.fill('input[aria-label="Email"]', credentials.email);
  await page.fill('input[aria-label="Password"]', credentials.password);
  await page.click('button[type="submit"]');
  await expect(page.getByRole('heading', { name: 'Command center' })).toBeVisible();
  await page.waitForTimeout(1000);
}

test.describe('API health checks', () => {
  test('backend health endpoint responds', async ({ request }) => {
    const response = await request.get(`${BACKEND_URL}/api/health`);
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body).toHaveProperty('status', 'ok');
  });

  test('frontend loads', async ({ page }) => {
    await page.goto(FRONTEND_URL);
    await expect(page.getByRole('heading', { name: 'Command center' })).toBeVisible();
  });

  test('AI service health', async ({ request }) => {
    const response = await request.get('http://localhost:8000/health');
    expect(response.ok()).toBeTruthy();
  });
});

test.describe('Conversation flow', () => {
  test('customer can start conversation and AI responds', async ({ page }) => {
    await login(page, TEST_CUSTOMER);
    await page.fill('input[placeholder="What do you need help with?"]', 'How do I reset my password?');
    await page.click('button:has-text("Create ticket")');
    await page.waitForTimeout(3000);
    await expect(page.locator('text=How do I reset my password?')).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Ticket priorities', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, TEST_CUSTOMER);
  });

  ['LOW', 'MEDIUM', 'HIGH', 'URGENT'].forEach((priority) => {
    test(`customer can create ${priority} priority ticket`, async ({ page }) => {
      const subject = `${priority} ticket ${Date.now()}`;
      await page.fill('input[placeholder="What do you need help with?"]', subject);
      await page.selectOption('select', priority);
      await page.click('button:has-text("Create ticket")');
      await expect(page.locator(`text=${subject}`)).toBeVisible({ timeout: 10000 });
      await expect(page.locator(`text=${priority}`)).toBeVisible({ timeout: 5000 });
    });
  });
});

test.describe('Session persistence', () => {
  test('session persists across page reloads', async ({ page }) => {
    await login(page, TEST_CUSTOMER);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Command center' })).toBeVisible();
    await expect(page.locator('text=Create a support ticket')).toBeVisible();
  });
});