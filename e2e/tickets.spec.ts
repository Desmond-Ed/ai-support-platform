import { expect, test, type APIRequestContext } from '@playwright/test';
import { SEEDED_USERS } from './support/config';
import {
  apiAssignTicket,
  apiCreateAgent,
  apiCreateConversation,
  apiCreateTicket,
  apiGetAgentTickets,
  apiLogin,
  apiRegisterCustomer,
  type AuthSession,
  type Ticket,
} from './support/api';
import { login, reloadWithSession, ticketCard } from './support/fixtures';

type AssignedTicketSetup = {
  agent: { credentials: { email: string; password: string }; session: AuthSession; id: string };
  ticket: Ticket;
};

async function createAssignedTicket(
  request: APIRequestContext,
  prefix: string,
): Promise<AssignedTicketSetup> {
  const admin = await apiLogin(request, SEEDED_USERS.ADMIN);
  const agent = await apiCreateAgent(request, admin, `${prefix}-agent`);
  const { session: customerSession } = await apiRegisterCustomer(request, `${prefix}-customer`);
  const conversation = await apiCreateConversation(request, customerSession.accessToken);
  const ticket = await apiCreateTicket(
    request,
    customerSession.accessToken,
    conversation.id,
    `E2E ${prefix} ${Date.now()}`,
  );
  await apiAssignTicket(request, agent.session.accessToken, ticket.id, agent.id);
  return { agent, ticket };
}

test.describe('Agent ticket queue', () => {
  test('agent assigns a ticket to themselves and the assignment survives reload', async ({
    page,
    request,
  }) => {
    const { agent, ticket } = await createAssignedTicket(request, 'assign');
    await login(page, agent.credentials, 'AGENT');

    const card = ticketCard(page, ticket.id);
    await expect(card).toBeVisible();
    const assignmentResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'PATCH' &&
        response.url().endsWith(`/api/tickets/${ticket.id}/assign`),
    );
    await card.getByRole('button', { name: 'Assign to me' }).click();
    expect((await assignmentResponse).status()).toBe(200);

    const assigned = await apiGetAgentTickets(request, agent.session.accessToken);
    expect(assigned.some((item) => item.id === ticket.id)).toBe(true);

    await reloadWithSession(page, 'AGENT');
    await expect(ticketCard(page, ticket.id)).toBeVisible();
  });

  test('agent status changes persist after reload', async ({ page, request }) => {
    const { agent, ticket } = await createAssignedTicket(request, 'status');
    await login(page, agent.credentials, 'AGENT');

    const card = ticketCard(page, ticket.id);
    const statusSelect = card.locator('select');
    await expect(statusSelect).toHaveValue('OPEN');

    const inProgressResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'PATCH' &&
        response.url().endsWith(`/api/tickets/${ticket.id}/status`),
    );
    await statusSelect.selectOption('IN_PROGRESS');
    expect((await inProgressResponse).status()).toBe(200);
    await expect(statusSelect).toHaveValue('IN_PROGRESS');

    await reloadWithSession(page, 'AGENT');
    await expect(ticketCard(page, ticket.id).locator('select')).toHaveValue('IN_PROGRESS');

    const resolvedResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'PATCH' &&
        response.url().endsWith(`/api/tickets/${ticket.id}/status`),
    );
    await ticketCard(page, ticket.id).locator('select').selectOption('RESOLVED');
    expect((await resolvedResponse).status()).toBe(200);

    await reloadWithSession(page, 'AGENT');
    await expect(ticketCard(page, ticket.id).locator('select')).toHaveValue('RESOLVED');
  });
});
