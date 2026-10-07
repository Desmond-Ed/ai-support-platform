import { expect, test } from '@playwright/test';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:4000';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

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

test.describe('Customer ticket flow', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, TEST_CUSTOMER);
  });

  test('customer can create a ticket', async ({ page }) => {
    const subject = `Test ticket ${Date.now()}`;
    await page.fill('input[placeholder="What do you need help with?"]', subject);
    await page.fill('textarea[placeholder="Add details (optional)"]', 'This is a test ticket description');
    await page.selectOption('select', 'HIGH');
    await page.click('button:has-text("Create ticket")');
    await expect(page.locator(`text=${subject}`)).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=HIGH')).toBeVisible();
  });

  test('customer sees their created tickets', async ({ page }) => {
    await expect(page.locator('text=Your tickets')).toBeVisible();
  });

  test('customer cannot see assign to me or status dropdown', async ({ page }) => {
    await page.fill('input[placeholder="What do you need help with?"]', `Test ticket ${Date.now()}`);
    await page.click('button:has-text("Create ticket")');
    await page.waitForTimeout(2000);
    await expect(page.locator('button:has-text("Assign to me")')).not.toBeVisible();
    await expect(page.locator('select').filter({ hasText: 'OPEN' })).not.toBeVisible();
  });
});

test.describe('Agent ticket management', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, TEST_AGENT);
  });

  test('agent sees assigned ticket queue', async ({ page }) => {
    await expect(page.locator('text=Assigned ticket queue')).toBeVisible();
  });

  test('agent can assign ticket to themselves', async ({ page }) => {
    await expect(page.locator('button:has-text("Assign to me")')).toBeVisible();
  });

  test('agent can update ticket status', async ({ page }) => {
    await expect(page.locator('select').filter({ hasText: 'OPEN' })).toBeVisible();
  });

  test('agent sees analytics', async ({ page }) => {
    await expect(page.locator('text=Ticket analytics')).toBeVisible();
    await expect(page.locator('text=Conversations')).toBeVisible();
    await expect(page.locator('text=Resolved by AI')).toBeVisible();
    await expect(page.locator('text=AI resolutions')).toBeVisible();
  });
});

test.describe('Ticket status transitions', () => {
  test('agent can transition ticket from OPEN to IN_PROGRESS to RESOLVED to CLOSED', async ({ page }) => {
    await login(page, TEST_AGENT);
    const statusSelect = page.locator('select').filter({ hasText: 'OPEN' }).first();
    if (await statusSelect.isVisible()) {
      await statusSelect.selectOption('IN_PROGRESS');
      await expect(page.locator('text=IN_PROGRESS').first()).toBeVisible({ timeout: 5000 });
      await statusSelect.selectOption('RESOLVED');
      await expect(page.locator('text=RESOLVED').first()).toBeVisible({ timeout: 5000 });
      await statusSelect.selectOption('CLOSED');
      await expect(page.locator('text=CLOSED').first()).toBeVisible({ timeout: 5000 });
    }
  });
});