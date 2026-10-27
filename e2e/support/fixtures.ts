import { expect, type Page } from '@playwright/test';
import {
  BACKEND_URL,
  FRONTEND_URL,
  SEEDED_USERS,
  type Credentials,
  type Role,
} from './config';
import type { Conversation, Message, Ticket } from './api';

export type SendMessageResponse = {
  customerMessage: Message;
  assistantMessage: Message;
  degraded?: boolean;
};

function isLoginResponse(response: import('@playwright/test').Response): boolean {
  return response.url().endsWith('/api/auth/login') && response.request().method() === 'POST';
}

function isMessageResponse(response: import('@playwright/test').Response): boolean {
  return (
    response.request().method() === 'POST' &&
    /\/api\/conversations\/[^/]+\/messages$/.test(response.url())
  );
}

export async function waitForAuthenticated(page: Page, role: Role): Promise<void> {
  const shell = page.getByTestId('app-shell');
  await expect(shell).toHaveAttribute('data-authenticated', 'true');
  await expect(shell).toHaveAttribute('data-role', role);
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();

  if (role === 'CUSTOMER') {
    await expect(page.getByText('Signed in as a customer')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Your conversations' })).toBeVisible();
    await expect(page.getByTestId('customer-chat')).toHaveAttribute('data-loaded', 'true');
    return;
  }

  await expect(page.getByText('Assigned ticket queue', { exact: true })).toBeVisible();
  await expect(page.getByText('Ticket analytics', { exact: true })).toBeVisible();
}

export async function login(
  page: Page,
  credentials: Credentials,
  role: Role,
): Promise<void> {
  await page.goto(FRONTEND_URL);

  const loginResponse = page.waitForResponse(isLoginResponse);
  await page.getByLabel('Email').fill(credentials.email);
  await page.getByLabel('Password').fill(credentials.password);
  await page.getByRole('button', { name: 'Sign in' }).click();

  const response = await loginResponse;
  expect(response.status(), `login for ${credentials.email}`).toBe(200);
  await waitForAuthenticated(page, role);

  const token = await page.evaluate(() => localStorage.getItem('accessToken'));
  expect(token, 'access token persisted before the next test action').toBeTruthy();
}

export async function loginSeeded(page: Page, role: Role): Promise<void> {
  await login(page, SEEDED_USERS[role], role);
}

export async function reloadWithSession(page: Page, role: Role): Promise<void> {
  await page.reload();
  await waitForAuthenticated(page, role);
}

export async function logout(page: Page): Promise<void> {
  const logoutResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/auth/logout') && response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Sign out' }).click();
  const response = await logoutResponse;
  expect(response.status()).toBe(204);
  await expectSignedOut(page);
}

export async function expectSignedOut(page: Page): Promise<void> {
  await expect(page.getByTestId('app-shell')).toHaveAttribute('data-authenticated', 'false');
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  const storage = await page.evaluate(() => ({
    accessToken: localStorage.getItem('accessToken'),
    userRole: localStorage.getItem('userRole'),
    userId: localStorage.getItem('userId'),
  }));
  expect(storage).toEqual({ accessToken: null, userRole: null, userId: null });
}

export async function waitForSocketConnected(page: Page): Promise<void> {
  await expect(page.getByTestId('app-shell')).toHaveAttribute('data-socket-connected', 'true', {
    timeout: 10_000,
  });
}

export function conversationButton(page: Page, conversationId: string) {
  return page.locator(
    `[data-testid="chat-conversation"][data-conversation-id="${conversationId}"]`,
  );
}

export function ticketCard(page: Page, ticketId: string) {
  return page.locator(`[data-testid="ticket-card"][data-ticket-id="${ticketId}"]`);
}

export function notificationForResource(page: Page, resourceId: string) {
  return page.locator(`[data-testid="notification"][data-resource-id="${resourceId}"]`);
}

export async function createConversationViaUi(page: Page): Promise<Conversation> {
  const createResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/conversations') &&
      response.request().method() === 'POST',
  );
  await page.getByTestId('chat-new').click();
  const response = await createResponse;
  expect(response.status()).toBe(201);
  const body = (await response.json()) as { conversation: Conversation };

  await expect(conversationButton(page, body.conversation.id)).toBeVisible();
  await expect(page.getByTestId('customer-chat')).toHaveAttribute('data-subscribed', 'true');
  return body.conversation;
}

export async function openConversation(page: Page, conversationId: string): Promise<void> {
  const historyResponse = page.waitForResponse(
    (response) =>
      response.request().method() === 'GET' &&
      response.url().endsWith(`/api/conversations/${conversationId}/messages`),
  );
  await conversationButton(page, conversationId).click();
  const response = await historyResponse;
  expect(response.status()).toBe(200);
  await expect(page.getByTestId('customer-chat')).toHaveAttribute('data-subscribed', 'true');
}

export async function sendChatMessage(page: Page, content: string): Promise<SendMessageResponse> {
  const messageResponse = page.waitForResponse(isMessageResponse);
  await page.getByTestId('chat-input').fill(content);
  await page.getByTestId('chat-send').click();
  const response = await messageResponse;
  expect(response.status()).toBe(201);
  return (await response.json()) as SendMessageResponse;
}

export async function createTicketViaUi(
  page: Page,
  subject: string,
  priority: Ticket['priority'] = 'MEDIUM',
): Promise<Ticket> {
  const ticketResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/tickets') && response.request().method() === 'POST',
  );
  await page.getByPlaceholder('What do you need help with?').fill(subject);
  await page.getByPlaceholder('Add details (optional)').fill(`E2E description for ${subject}`);
  await page.locator('select').selectOption(priority);
  await page.getByRole('button', { name: 'Create ticket' }).click();
  const response = await ticketResponse;
  expect(response.status()).toBe(201);
  const body = (await response.json()) as { ticket: Ticket };
  await expect(ticketCard(page, body.ticket.id)).toBeVisible();
  return body.ticket;
}
