import { expect, test } from '@playwright/test';
import { BACKEND_URL, SEEDED_USERS } from './support/config';
import { apiLogin } from './support/api';
import {
  expectSignedOut,
  login,
  loginSeeded,
  logout,
  reloadWithSession,
} from './support/fixtures';

test.describe('Authentication', () => {
  test('customer login reaches the customer dashboard and chat', async ({ page }) => {
    await loginSeeded(page, 'CUSTOMER');
    await expect(page.getByText('Create a support ticket')).toBeVisible();
    await expect(page.getByText('Your tickets')).toBeVisible();
    await expect(page.getByTestId('customer-chat')).toBeVisible();
  });

  test('agent login reaches the assigned queue and analytics', async ({ page }) => {
    await loginSeeded(page, 'AGENT');
    await expect(page.getByText('Assigned ticket queue', { exact: true })).toBeVisible();
    await expect(page.getByText('Ticket analytics', { exact: true })).toBeVisible();
  });

  test('admin login reaches the operations dashboard', async ({ page }) => {
    await loginSeeded(page, 'ADMIN');
    await expect(page.getByText('Assigned ticket queue', { exact: true })).toBeVisible();
    await expect(page.getByText('Ticket analytics', { exact: true })).toBeVisible();
  });

  test('login fails with an incorrect password', async ({ page }) => {
    await page.goto('/');
    const loginResponse = page.waitForResponse((response) =>
      response.url().endsWith('/api/auth/login'),
    );
    await page.getByLabel('Email').fill(SEEDED_USERS.CUSTOMER.email);
    await page.getByLabel('Password').fill('wrong-password');
    await page.getByRole('button', { name: 'Sign in' }).click();

    expect((await loginResponse).status()).toBe(401);
    await expect(page.getByText('Invalid email or password')).toBeVisible();
    await expectSignedOut(page);
  });

  test('login fails for an unregistered email', async ({ page }) => {
    await page.goto('/');
    const loginResponse = page.waitForResponse((response) =>
      response.url().endsWith('/api/auth/login'),
    );
    await page.getByLabel('Email').fill(`missing-${Date.now()}@example.com`);
    await page.getByLabel('Password').fill(SEEDED_USERS.CUSTOMER.password);
    await page.getByRole('button', { name: 'Sign in' }).click();

    expect((await loginResponse).status()).toBe(401);
    await expect(page.getByText('Invalid email or password')).toBeVisible();
  });

  test('a confirmed customer session survives a page reload', async ({ page, request }) => {
    await loginSeeded(page, 'CUSTOMER');
    const tokenBeforeReload = await page.evaluate(() => localStorage.getItem('accessToken'));

    await reloadWithSession(page, 'CUSTOMER');

    const tokenAfterReload = await page.evaluate(() => localStorage.getItem('accessToken'));
    expect(tokenAfterReload).toBe(tokenBeforeReload);
    await expect(page.getByText('Create a support ticket')).toBeVisible();
    await expect(page.getByTestId('customer-chat')).toBeVisible();

    const me = await request.get(`${BACKEND_URL}/api/users/me`, {
      headers: { Authorization: `Bearer ${tokenAfterReload}` },
    });
    expect(me.status()).toBe(200);
  });

  test('sign out calls the logout API and clears the local session', async ({ page }) => {
    await loginSeeded(page, 'CUSTOMER');
    await logout(page);
    await expect(page.getByText('Sign in to load live operations data')).toBeVisible();
  });

  test('server rejects customer access to agent and admin operations', async ({ request }) => {
    const customer = await apiLogin(request, SEEDED_USERS.CUSTOMER);

    const agentQueue = await request.get(`${BACKEND_URL}/api/tickets/agent`, {
      headers: { Authorization: `Bearer ${customer.accessToken}` },
    });
    expect(agentQueue.status()).toBe(403);

    const analytics = await request.get(`${BACKEND_URL}/api/analytics/overview`, {
      headers: { Authorization: `Bearer ${customer.accessToken}` },
    });
    expect(analytics.status()).toBe(403);

    const adminUsers = await request.get(`${BACKEND_URL}/api/admin/users`, {
      headers: { Authorization: `Bearer ${customer.accessToken}` },
    });
    expect(adminUsers.status()).toBe(403);

    const unauthenticated = await request.get(`${BACKEND_URL}/api/users/me`);
    expect(unauthenticated.status()).toBe(401);
  });

  test('server rejects agent access to admin operations', async ({ request }) => {
    const agent = await apiLogin(request, SEEDED_USERS.AGENT);
    const adminUsers = await request.get(`${BACKEND_URL}/api/admin/users`, {
      headers: { Authorization: `Bearer ${agent.accessToken}` },
    });
    expect(adminUsers.status()).toBe(403);

    const analytics = await request.get(`${BACKEND_URL}/api/analytics/overview`, {
      headers: { Authorization: `Bearer ${agent.accessToken}` },
    });
    expect(analytics.status()).toBe(200);
  });
});
