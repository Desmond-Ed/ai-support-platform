import { expect, test } from '@playwright/test';

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const TEST_CUSTOMER = { email: 'customer@example.com', password: 'DevPassword123!' };

async function loginAsCustomer(page: any) {
  await page.goto(FRONTEND_URL);
  await page.fill('input[aria-label="Email"]', TEST_CUSTOMER.email);
  await page.fill('input[aria-label="Password"]', TEST_CUSTOMER.password);
  await page.click('button[type="submit"]');
  await expect(page.getByRole('heading', { name: 'Command center' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Your conversations' })).toBeVisible();
}

test('customer chat sends a message and restores history after reload', async ({ page }) => {
  await loginAsCustomer(page);
  await page.getByTestId('chat-new').click();

  const conversation = page.getByTestId('chat-conversation').first();
  await expect(conversation).toBeVisible();
  const conversationId = await conversation.getAttribute('data-conversation-id');
  expect(conversationId).toBeTruthy();

  const messageText = `E2E chat message ${Date.now()}`;
  await page.getByTestId('chat-input').fill(messageText);
  await page.getByTestId('chat-send').click();

  const messages = page.getByTestId('chat-message');
  const customerMessage = messages.filter({ hasText: messageText });
  const nonCustomerMessage = messages.filter({ hasText: /AI|SYSTEM/ });
  await expect(customerMessage).toBeVisible({ timeout: 25000 });
  await expect(messages).toHaveCount(2, { timeout: 25000 });
  await expect(nonCustomerMessage).toHaveCount(1, { timeout: 25000 });

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Your conversations' })).toBeVisible();
  await page.locator(`[data-testid="chat-conversation"][data-conversation-id="${conversationId}"]`).click();

  const restoredMessages = page.getByTestId('chat-message');
  await expect(restoredMessages.filter({ hasText: messageText })).toBeVisible({ timeout: 10000 });
  await expect(restoredMessages).toHaveCount(2);
  await expect(restoredMessages.filter({ hasText: /AI|SYSTEM/ })).toHaveCount(1);
});