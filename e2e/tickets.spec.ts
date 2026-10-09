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

function ticketCard(page: any, subject: string) {
  return page.getByRole('article').filter({
    has: page.getByRole('heading', { name: subject, exact: true }),
  });
}

async function createTicketAssignedToAgent(page: any, browser: any, request: any): Promise<string> {
  const { token, agentId } = await page.evaluate(() => ({
    token: localStorage.getItem('accessToken'),
    agentId: localStorage.getItem('userId'),
  }));
  if (!token || !agentId) throw new Error('Agent session is missing credentials');

  const customerContext = await browser.newContext();
  try {
    const customerPage = await customerContext.newPage();
    await login(customerPage, TEST_CUSTOMER);
    const subject = `E2E ${Date.now()}`;
    await customerPage.fill('input[placeholder="What do you need help with?"]', subject);
    const ticketResponsePromise = customerPage.waitForResponse(
      (response: any) => response.url().endsWith('/api/tickets') && response.request().method() === 'POST',
    );
    await customerPage.click('button:has-text("Create ticket")');
    const ticketResponse = await ticketResponsePromise;
    const { ticket } = await ticketResponse.json();
    const assignmentResponse = await request.patch(`${BACKEND_URL}/api/tickets/${ticket.id}/assign`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { agentId },
    });
    if (!assignmentResponse.ok()) throw new Error('Unable to assign setup ticket to agent');

    await page.reload();
    await expect(ticketCard(page, subject)).toBeVisible({ timeout: 10000 });
    return subject;
  } finally {
    await customerContext.close();
  }
}

test.describe('Customer ticket flow', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, TEST_CUSTOMER);
  });

  test('customer can create a ticket', async ({ page }) => {
    const subject = `E2E ${Date.now()}`;
    await page.fill('input[placeholder="What do you need help with?"]', subject);
    await page.fill('textarea[placeholder="Add details (optional)"]', 'This is a test ticket description');
    await page.selectOption('select', 'HIGH');
    await page.click('button:has-text("Create ticket")');
    const card = ticketCard(page, subject);
    await expect(card).toBeVisible({ timeout: 10000 });
    await expect(card.getByText('HIGH', { exact: true })).toBeVisible();
  });

  test('customer sees their created tickets', async ({ page }) => {
    await expect(page.locator('text=Your tickets')).toBeVisible();
  });

  test('customer cannot see assign to me or status dropdown', async ({ page }) => {
    const subject = `E2E ${Date.now()}`;
    await page.fill('input[placeholder="What do you need help with?"]', subject);
    await page.click('button:has-text("Create ticket")');
    const card = ticketCard(page, subject);
    await expect(card).toBeVisible({ timeout: 10000 });
    await expect(card.getByRole('button', { name: 'Assign to me' })).not.toBeVisible();
    await expect(card.locator('select').filter({ hasText: 'OPEN' })).not.toBeVisible();
  });
});

test.describe('Agent ticket management', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, TEST_AGENT);
  });

  test('agent sees assigned ticket queue', async ({ page, browser, request }) => {
    await createTicketAssignedToAgent(page, browser, request);
    await expect(page.locator('text=Assigned ticket queue')).toBeVisible();
  });

  test('agent can assign ticket to themselves', async ({ page, browser, request }) => {
    const subject = await createTicketAssignedToAgent(page, browser, request);
    await expect(ticketCard(page, subject).getByRole('button', { name: 'Assign to me' })).toBeVisible();
  });

  test('agent can update ticket status', async ({ page, browser, request }) => {
    const subject = await createTicketAssignedToAgent(page, browser, request);
    await expect(ticketCard(page, subject).locator('select').filter({ hasText: 'OPEN' })).toBeVisible();
  });

  test('agent sees analytics', async ({ page }) => {
    await expect(page.locator('text=Ticket analytics')).toBeVisible();
    await expect(page.locator('text=Conversations')).toBeVisible();
    await expect(page.locator('text=Resolved by AI')).toBeVisible();
    await expect(page.locator('text=AI resolutions')).toBeVisible();
  });
});

test.describe('Ticket status transitions', () => {
  test('agent can transition ticket from OPEN to IN_PROGRESS to RESOLVED to CLOSED', async ({ page, browser, request }) => {
    await login(page, TEST_AGENT);
    const subject = await createTicketAssignedToAgent(page, browser, request);
    const card = ticketCard(page, subject);
    const statusSelect = card.locator('select').filter({ hasText: 'OPEN' }).first();
    await expect(statusSelect).toBeVisible();
    await statusSelect.selectOption('IN_PROGRESS');
    await expect(statusSelect).toHaveValue('IN_PROGRESS');
    await statusSelect.selectOption('RESOLVED');
    await expect(statusSelect).toHaveValue('RESOLVED');
    await statusSelect.selectOption('CLOSED');
    await expect(statusSelect).toHaveValue('CLOSED');
    await page.reload();
    await expect(ticketCard(page, subject).locator('select')).toHaveValue('CLOSED');
  });
});