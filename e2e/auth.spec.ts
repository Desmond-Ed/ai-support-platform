import { expect, test } from '@playwright/test';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:4000';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

const TEST_CUSTOMER = { email: 'customer@example.com', password: 'DevPassword123!' };
const TEST_AGENT = { email: 'agent@example.com', password: 'DevPassword123!' };
const TEST_ADMIN = { email: 'admin@example.com', password: 'DevPassword123!' };

async function login(page: any, credentials: { email: string; password: string }) {
  await page.goto(FRONTEND_URL);
  await page.fill('input[aria-label="Email"]', credentials.email);
  await page.fill('input[aria-label="Password"]', credentials.password);
  await page.click('button[type="submit"]');
  await expect(page.getByRole('heading', { name: 'Command center' })).toBeVisible();
  await page.waitForTimeout(1000);
}

async function logout(page: any) {
  await page.click('button:has-text("Sign out")');
  await expect(page.locator('form')).toBeVisible();
}

test.describe('Authentication', () => {
  test('customer can login and sees customer dashboard', async ({ page }) => {
    await login(page, TEST_CUSTOMER);
    await expect(page.locator('text=Create a support ticket')).toBeVisible();
    await expect(page.locator('text=Your tickets')).toBeVisible();
    await expect(page.locator('text=Signed in as a customer')).toBeVisible();
  });

  test('agent can login and sees agent dashboard with analytics', async ({ page }) => {
    await login(page, TEST_AGENT);
    await expect(page.locator('text=Assigned ticket queue')).toBeVisible();
    await expect(page.locator('text=Ticket analytics')).toBeVisible();
    await expect(page.locator('text=Conversations')).toBeVisible();
  });

  test('admin can login and sees admin dashboard', async ({ page }) => {
    await login(page, TEST_ADMIN);
    await expect(page.locator('text=Assigned ticket queue')).toBeVisible();
    await expect(page.locator('text=Ticket analytics')).toBeVisible();
  });

  test('login fails with wrong password', async ({ page }) => {
    await page.goto(FRONTEND_URL);
    await page.fill('input[aria-label="Email"]', TEST_CUSTOMER.email);
    await page.fill('input[aria-label="Password"]', 'wrongpassword');
    await page.click('button[type="submit"]');
    await expect(page.locator('text=Invalid email or password')).toBeVisible();
  });

  test('login fails with unregistered email', async ({ page }) => {
    await page.goto(FRONTEND_URL);
    await page.fill('input[aria-label="Email"]', 'nonexistent@example.com');
    await page.fill('input[aria-label="Password"]', 'DevPassword123!');
    await page.click('button[type="submit"]');
    await expect(page.locator('text=Invalid email or password')).toBeVisible();
  });

  test('logout clears session', async ({ page }) => {
    await login(page, TEST_CUSTOMER);
    await logout(page);
    await expect(page.locator('form')).toBeVisible();
    await expect(page.locator('text=Sign in to load live operations data')).toBeVisible();
  });
});