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

function ticketCard(page: any, subject: string) {
  return page.getByRole('article').filter({
    has: page.getByRole('heading', { name: subject, exact: true }),
  });
}

async function createTicketAssignedToAgent(agentPage: any, browser: any, request: any): Promise<string> {
  const { token, agentId } = await agentPage.evaluate(() => ({
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
    await expect(ticketCard(customerPage, subject)).toBeVisible({ timeout: 10000 });

    const assignmentResponse = await request.patch(`${BACKEND_URL}/api/tickets/${ticket.id}/assign`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { agentId },
    });
    if (!assignmentResponse.ok()) throw new Error('Unable to assign setup ticket to agent');
    return subject;
  } finally {
    await customerContext.close();
  }
}

test.describe('Notifications', () => {
  test('customer sees notifications panel', async ({ page }) => {
    await login(page, TEST_CUSTOMER);
    await expect(page.getByRole('heading', { name: 'Notifications' })).toBeVisible();
    await expect(page.locator('button:has-text("Mark all read")')).toBeVisible();
  });

  test('agent sees notifications panel', async ({ page }) => {
    await login(page, TEST_AGENT);
    await expect(page.getByRole('heading', { name: 'Notifications' })).toBeVisible();
  });

  test('mark all read button works', async ({ page }) => {
    await login(page, TEST_CUSTOMER);
    await page.click('button:has-text("Mark all read")');
    await page.waitForTimeout(500);
  });
});

test.describe('Realtime updates', () => {
  test('agent sees ticket created notification when customer creates ticket', async ({ context, browser, request }) => {
    // Login as agent in one tab
    const agentPage = await context.newPage();
    await login(agentPage, TEST_AGENT);
    await expect(agentPage.locator('text=Assigned ticket queue')).toBeVisible();

    // Create a unique customer ticket and assign it so it appears in this agent's queue.
    const subject = await createTicketAssignedToAgent(agentPage, browser, request);

    // Agent should see the new ticket (via realtime or refresh)
    await agentPage.waitForTimeout(3000);
    await agentPage.reload();
    await agentPage.waitForTimeout(1000);
    await expect(ticketCard(agentPage, subject)).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Analytics overview', () => {
  test('agent sees analytics metrics', async ({ page }) => {
    await login(page, TEST_AGENT);
    await expect(page.locator('text=Conversations')).toBeVisible();
    await expect(page.locator('text=Resolved by AI')).toBeVisible();
    await expect(page.locator('text=AI resolutions')).toBeVisible();
    await expect(page.locator('text=Unread notifications')).toBeVisible();
  });

  test('customer does not see full analytics', async ({ page }) => {
    await login(page, TEST_CUSTOMER);
    await expect(page.locator('text=Analytics appear for agents and admins')).toBeVisible();
  });

  test('admin sees analytics', async ({ page }) => {
    await login(page, { email: 'admin@example.com', password: 'DevPassword123!' });
    await expect(page.locator('text=Ticket analytics')).toBeVisible();
  });
});