import { expect, test } from '@playwright/test';
import { AI_SERVICE_URL, BACKEND_URL } from './support/config';
import { apiRegisterCustomer, type Ticket } from './support/api';
import {
  createTicketViaUi,
  login,
  reloadWithSession,
  ticketCard,
} from './support/fixtures';

test.describe('Service health', () => {
  test('backend health endpoint responds', async ({ request }) => {
    const response = await request.get(`${BACKEND_URL}/api/health`);
    expect(response.ok()).toBeTruthy();
    expect(await response.json()).toHaveProperty('status', 'ok');
  });

  test('AI service health endpoint responds', async ({ request }) => {
    const response = await request.get(`${AI_SERVICE_URL}/api/health`);
    expect(response.ok()).toBeTruthy();
  });

  test('frontend loads the command center', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Command center' })).toBeVisible();
  });
});

test.describe('Customer ticket creation', () => {
  test('customer creates a ticket that persists after reload', async ({ page, request }) => {
    const { credentials } = await apiRegisterCustomer(request, 'ticket-persist');
    await login(page, credentials, 'CUSTOMER');

    const subject = `E2E persistence ${Date.now()}`;
    const ticket = await createTicketViaUi(page, subject, 'HIGH');
    await expect(ticketCard(page, ticket.id).getByText('HIGH', { exact: true })).toBeVisible();

    await reloadWithSession(page, 'CUSTOMER');
    const restored = ticketCard(page, ticket.id);
    await expect(restored.getByRole('heading', { name: subject, exact: true })).toBeVisible();
    await expect(restored.getByText('HIGH', { exact: true })).toBeVisible();
  });

  const priorities: Array<Ticket['priority']> = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];
  for (const priority of priorities) {
    test(`customer creates a ${priority} priority ticket`, async ({ page, request }) => {
      const { credentials } = await apiRegisterCustomer(request, `ticket-${priority.toLowerCase()}`);
      await login(page, credentials, 'CUSTOMER');

      const subject = `E2E ${priority} ${Date.now()}`;
      const ticket = await createTicketViaUi(page, subject, priority);
      const card = ticketCard(page, ticket.id);

      await expect(card.getByRole('heading', { name: subject, exact: true })).toBeVisible();
      await expect(card.getByText(priority, { exact: true })).toBeVisible();
      await expect(card.getByRole('button', { name: 'Assign to me' })).toHaveCount(0);
      await expect(card.locator('select')).toHaveCount(0);
    });
  }
});
