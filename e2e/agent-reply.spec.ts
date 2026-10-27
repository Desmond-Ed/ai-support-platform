import { expect, test, type APIRequestContext } from '@playwright/test';
import { BACKEND_URL, SEEDED_USERS } from './support/config';
import {
  apiCreateAgent,
  apiCreateConversation,
  apiCreateTicket,
  apiGetConversations,
  apiGetMessages,
  apiGetTickets,
  apiLogin,
  apiPostAgentMessage,
  apiRegisterCustomer,
  apiUpdateTicketStatus,
  type AuthSession,
} from './support/api';
import {
  login,
  notificationForResource,
  openConversation,
  waitForSocketConnected,
} from './support/fixtures';

async function createAssignedWorkflow(
  request: APIRequestContext,
  prefix: string,
): Promise<{
  agent: { credentials: { email: string; password: string }; session: AuthSession; id: string };
  customer: { credentials: { email: string; password: string }; session: AuthSession };
  conversationId: string;
  ticketId: string;
}> {
  const admin = await apiLogin(request, SEEDED_USERS.ADMIN);
  const agent = await apiCreateAgent(request, admin, `${prefix}-agent`);
  const customer = await apiRegisterCustomer(request, `${prefix}-customer`);
  const conversation = await apiCreateConversation(request, customer.session.accessToken);
  const ticket = await apiCreateTicket(
    request,
    customer.session.accessToken,
    conversation.id,
    `E2E ${prefix} ${Date.now()}`,
  );

  const assignment = await request.patch(`${BACKEND_URL}/api/tickets/${ticket.id}/assign`, {
    headers: { Authorization: `Bearer ${agent.session.accessToken}` },
    data: { agentId: agent.id },
  });
  expect(assignment.status()).toBe(200);

  return {
    agent,
    customer,
    conversationId: conversation.id,
    ticketId: ticket.id,
  };
}

test('assigned agent reply reaches the open customer conversation and resolution reaches the customer', async ({
  page,
  request,
}) => {
  const workflow = await createAssignedWorkflow(request, 'workflow');
  await login(page, workflow.customer.credentials, 'CUSTOMER');
  await waitForSocketConnected(page);
  await openConversation(page, workflow.conversationId);

  const agentReply = 'I can help with this request.';
  await apiPostAgentMessage(
    request,
    workflow.agent.session.accessToken,
    workflow.conversationId,
    agentReply,
  );

  await expect(
    page.locator('[data-testid="chat-message"][data-sender-type="AGENT"]'),
  ).toContainText(agentReply);

  const agentMessages = await apiGetMessages(
    request,
    workflow.customer.session.accessToken,
    workflow.conversationId,
  );
  expect(agentMessages).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        senderType: 'AGENT',
        senderId: workflow.agent.id,
        content: agentReply,
      }),
    ]),
  );

  const resolvedTicket = await apiUpdateTicketStatus(
    request,
    workflow.agent.session.accessToken,
    workflow.ticketId,
    'RESOLVED',
  );
  expect(resolvedTicket.status).toBe('RESOLVED');

  await expect(
    notificationForResource(page, workflow.ticketId).filter({
      hasText: 'Your ticket has been resolved.',
    }),
  ).toBeVisible();

  const customerTickets = await apiGetTickets(request, workflow.customer.session.accessToken);
  expect(customerTickets.find((ticket) => ticket.id === workflow.ticketId)?.status).toBe(
    'RESOLVED',
  );

  const conversations = await apiGetConversations(
    request,
    workflow.customer.session.accessToken,
  );
  expect(
    conversations.find((conversation) => conversation.id === workflow.conversationId)?.status,
  ).toBe('RESOLVED');

  const resolvedReply = await request.post(
    `${BACKEND_URL}/api/conversations/${workflow.conversationId}/agent-messages`,
    {
      headers: { Authorization: `Bearer ${workflow.agent.session.accessToken}` },
      data: { content: 'This reply must be rejected.' },
    },
  );
  expect(resolvedReply.status()).toBe(409);
});

test('another customer and an unassigned agent cannot read or alter the conversation', async ({
  request,
}) => {
  const workflow = await createAssignedWorkflow(request, 'authorization');
  const admin = await apiLogin(request, SEEDED_USERS.ADMIN);
  const otherAgent = await apiCreateAgent(request, admin, 'authorization-other-agent');
  const otherCustomer = await apiRegisterCustomer(request, 'authorization-other-customer');

  const historyUrl = `${BACKEND_URL}/api/conversations/${workflow.conversationId}/messages`;
  const assignedHistory = await request.get(historyUrl, {
    headers: { Authorization: `Bearer ${workflow.agent.session.accessToken}` },
  });
  expect(assignedHistory.status()).toBe(200);

  const unassignedAgentHistory = await request.get(historyUrl, {
    headers: { Authorization: `Bearer ${otherAgent.session.accessToken}` },
  });
  expect(unassignedAgentHistory.status()).toBe(403);

  const unassignedAgentReply = await request.post(
    `${BACKEND_URL}/api/conversations/${workflow.conversationId}/agent-messages`,
    {
      headers: { Authorization: `Bearer ${otherAgent.session.accessToken}` },
      data: { content: 'Unauthorized agent reply' },
    },
  );
  expect(unassignedAgentReply.status()).toBe(403);

  const otherCustomerHistory = await request.get(historyUrl, {
    headers: { Authorization: `Bearer ${otherCustomer.session.accessToken}` },
  });
  expect(otherCustomerHistory.status()).toBe(404);

  const otherCustomerMessage = await request.post(historyUrl, {
    headers: { Authorization: `Bearer ${otherCustomer.session.accessToken}` },
    data: { content: 'Unauthorized customer message' },
  });
  expect(otherCustomerMessage.status()).toBe(404);

  const otherCustomerHandoff = await request.post(
    `${BACKEND_URL}/api/conversations/${workflow.conversationId}/handoff`,
    { headers: { Authorization: `Bearer ${otherCustomer.session.accessToken}` } },
  );
  expect(otherCustomerHandoff.status()).toBe(404);

  const customerAgentReply = await request.post(
    `${BACKEND_URL}/api/conversations/${workflow.conversationId}/agent-messages`,
    {
      headers: { Authorization: `Bearer ${workflow.customer.session.accessToken}` },
      data: { content: 'Customer cannot send an agent reply' },
    },
  );
  expect(customerAgentReply.status()).toBe(403);
});
