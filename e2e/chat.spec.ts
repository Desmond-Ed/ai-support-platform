import { expect, test } from '@playwright/test';
import { AI_OUTAGE_MARKER, GROUNDED_ANSWER } from './support/config';
import {
  apiGetConversations,
  apiGetMessages,
  apiGetTickets,
  apiRegisterCustomer,
} from './support/api';
import {
  conversationButton,
  createConversationViaUi,
  login,
  openConversation,
  reloadWithSession,
  sendChatMessage,
} from './support/fixtures';

test('customer gets a grounded AI reply and history survives reload', async ({ page, request }) => {
  const { credentials, session } = await apiRegisterCustomer(request, 'chat-ai-success');
  await login(page, credentials, 'CUSTOMER');

  const conversation = await createConversationViaUi(page);
  const message = 'How are refunds processed?';
  const result = await sendChatMessage(page, message);

  expect(result.assistantMessage.senderType).toBe('AI');
  expect(result.assistantMessage.content).toBe(GROUNDED_ANSWER);
  expect(result.degraded).toBeFalsy();

  const messages = page.getByTestId('chat-message');
  await expect(messages.filter({ hasText: message })).toBeVisible();
  await expect(
    page.locator('[data-testid="chat-message"][data-sender-type="AI"]'),
  ).toContainText(GROUNDED_ANSWER);
  await expect(
    page.locator('[data-testid="chat-message"][data-sender-type="SYSTEM"]'),
  ).toHaveCount(0);
  await expect(conversationButton(page, conversation.id).getByText('ai handling', { exact: true })).toBeVisible();

  await reloadWithSession(page, 'CUSTOMER');
  await openConversation(page, conversation.id);
  await expect(messages.filter({ hasText: message })).toBeVisible();
  await expect(
    page.locator('[data-testid="chat-message"][data-sender-type="AI"]'),
  ).toContainText(GROUNDED_ANSWER);

  const persisted = await apiGetMessages(request, session.accessToken, conversation.id);
  expect(persisted.map((item) => item.senderType)).toEqual(['CUSTOMER', 'AI']);
});

test('AI provider outage produces a persisted degraded escalation, not a fake AI reply', async ({
  page,
  request,
}) => {
  const { credentials, session } = await apiRegisterCustomer(request, 'chat-ai-degraded');
  await login(page, credentials, 'CUSTOMER');

  const conversation = await createConversationViaUi(page);
  const message = `Please ${AI_OUTAGE_MARKER} for this request`;
  const result = await sendChatMessage(page, message);

  expect(result.assistantMessage.senderType).toBe('SYSTEM');
  expect(result.degraded).toBe(true);

  await expect(page.getByTestId('chat-message').filter({ hasText: message })).toBeVisible();
  await expect(
    page.locator('[data-testid="chat-message"][data-sender-type="SYSTEM"]'),
  ).toContainText('AI support service is temporarily unavailable');
  await expect(
    page.locator('[data-testid="chat-message"][data-sender-type="AI"]'),
  ).toHaveCount(0);
  await expect(page.getByTestId('chat-banner')).toBeVisible();

  const persisted = await apiGetMessages(request, session.accessToken, conversation.id);
  expect(persisted.map((item) => item.senderType)).toEqual(['CUSTOMER', 'SYSTEM']);

  const tickets = await apiGetTickets(request, session.accessToken);
  expect(tickets.filter((ticket) => ticket.conversationId === conversation.id)).toHaveLength(1);
});

test('repeated manual handoff keeps one ticket and one system handoff message', async ({
  page,
  request,
}) => {
  const { credentials, session } = await apiRegisterCustomer(request, 'chat-handoff');
  await login(page, credentials, 'CUSTOMER');

  const conversation = await createConversationViaUi(page);
  const handoffResponse = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      response.url().endsWith(`/api/conversations/${conversation.id}/handoff`),
  );
  await page.getByTestId('chat-handoff').click();
  expect((await handoffResponse).status()).toBe(200);
  await expect(page.getByTestId('chat-banner')).toBeVisible();
  await expect(page.getByTestId('chat-handoff')).toBeEnabled();

  const repeatedHandoff = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      response.url().endsWith(`/api/conversations/${conversation.id}/handoff`),
  );
  await page.getByTestId('chat-handoff').click();
  expect((await repeatedHandoff).status()).toBe(200);

  const persisted = await apiGetMessages(request, session.accessToken, conversation.id);
  expect(persisted.filter((item) => item.senderType === 'SYSTEM')).toHaveLength(1);
  expect(persisted[0].content).toBe('A support agent will follow up shortly.');

  const tickets = await apiGetTickets(request, session.accessToken);
  expect(tickets.filter((ticket) => ticket.conversationId === conversation.id)).toHaveLength(1);

  const conversations = await apiGetConversations(request, session.accessToken);
  expect(conversations.find((item) => item.id === conversation.id)?.status).toBe('ESCALATED');

  await reloadWithSession(page, 'CUSTOMER');
  await openConversation(page, conversation.id);
  await expect(page.getByTestId('chat-banner')).toBeVisible();
  await expect(
    page.locator('[data-testid="chat-message"][data-sender-type="SYSTEM"]'),
  ).toHaveCount(1);
  await expect(
    page.locator('[data-testid="chat-message"][data-sender-type="SYSTEM"]'),
  ).toContainText('A support agent will follow up shortly.');
});
