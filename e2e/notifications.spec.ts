import { expect, test } from '@playwright/test';
import { BACKEND_URL, SEEDED_USERS } from './support/config';
import {
  apiAssignTicket,
  apiCreateAgent,
  apiCreateConversation,
  apiCreateTicket,
  apiGetNotifications,
  apiLogin,
  apiRegisterCustomer,
} from './support/api';
import {
  createTicketViaUi,
  login,
  loginSeeded,
  notificationForResource,
  waitForSocketConnected,
} from './support/fixtures';

test.describe('Notification panels', () => {
  test('customer sees the notifications panel and read-all control', async ({ page }) => {
    await loginSeeded(page, 'CUSTOMER');
    await expect(page.getByRole('heading', { name: 'Notifications' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Mark all read' })).toBeVisible();
  });

  test('agent sees the notifications panel', async ({ page }) => {
    await loginSeeded(page, 'AGENT');
    await expect(page.getByRole('heading', { name: 'Notifications' })).toBeVisible();
  });
});

test.describe('Realtime notifications', () => {
  test('customer receives a ticket notification and mark-all-read persists for that customer only', async ({
    page,
    request,
  }) => {
    const { credentials, session } = await apiRegisterCustomer(request, 'notifications-customer');
    await login(page, credentials, 'CUSTOMER');
    await waitForSocketConnected(page);

    const ticket = await createTicketViaUi(page, `E2E notification ${Date.now()}`);
    const notification = notificationForResource(page, ticket.id);
    await expect(notification).toBeVisible();
    await expect(notification).toContainText(ticket.subject);

    const readResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'PATCH' &&
        response.url().endsWith('/api/notifications/read-all'),
    );
    await page.getByRole('button', { name: 'Mark all read' }).click();
    expect((await readResponse).status()).toBe(200);
    await expect(notification).toHaveAttribute('data-read', 'true');

    const persisted = await apiGetNotifications(request, session.accessToken);
    expect(persisted.length).toBeGreaterThan(0);
    expect(persisted.every((item) => item.read)).toBe(true);
    expect(persisted).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'TICKET_CREATED',
          payload: expect.objectContaining({ resourceId: ticket.id }),
          read: true,
        }),
      ]),
    );
  });

  test('agent receives an assignment notification without reloading', async ({ page, request }) => {
    const admin = await apiLogin(request, SEEDED_USERS.ADMIN);
    const agent = await apiCreateAgent(request, admin, 'notifications-agent');
    const customer = await apiRegisterCustomer(request, 'notifications-assignment');
    const conversation = await apiCreateConversation(request, customer.session.accessToken);
    const ticket = await apiCreateTicket(
      request,
      customer.session.accessToken,
      conversation.id,
      `E2E assignment ${Date.now()}`,
    );

    await login(page, agent.credentials, 'AGENT');
    await waitForSocketConnected(page);

    await apiAssignTicket(request, agent.session.accessToken, ticket.id, agent.id);

    const notification = notificationForResource(page, ticket.id);
    await expect(notification).toBeVisible();
    await expect(notification).toContainText('A ticket was assigned to you');

    const persisted = await apiGetNotifications(request, agent.session.accessToken);
    expect(persisted).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'TICKET_STATUS_CHANGED',
          payload: expect.objectContaining({
            resourceId: ticket.id,
            message: 'A ticket was assigned to you',
          }),
        }),
      ]),
    );
  });
});

test.describe('Analytics overview', () => {
  test('agent sees analytics metrics', async ({ page }) => {
    await loginSeeded(page, 'AGENT');
    await expect(page.getByText('Conversations', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Resolved by AI', { exact: true })).toBeVisible();
    await expect(page.getByText('AI resolutions', { exact: true })).toBeVisible();
    await expect(page.getByText('Unread notifications', { exact: true })).toBeVisible();
  });

  test('customer sees the analytics placeholder instead of operations metrics', async ({ page }) => {
    await loginSeeded(page, 'CUSTOMER');
    await expect(page.getByText('Analytics appear for agents and admins.')).toBeVisible();
  });

  test('admin sees analytics', async ({ page }) => {
    await loginSeeded(page, 'ADMIN');
    await expect(page.getByText('Ticket analytics', { exact: true })).toBeVisible();
  });
});
