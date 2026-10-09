import { expect, test } from '@playwright/test';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:4000';

const TEST_CUSTOMER = { email: 'customer@example.com', password: 'DevPassword123!' };
const TEST_AGENT = { email: 'agent@example.com', password: 'DevPassword123!' };

test('assigned agent can reply, while customer and resolved conversation are rejected', async ({ request }) => {
  const customerLogin = await request.post(`${BACKEND_URL}/api/auth/login`, { data: TEST_CUSTOMER });
  expect(customerLogin.status()).toBe(200);
  const customerAuth = await customerLogin.json();

  const agentLogin = await request.post(`${BACKEND_URL}/api/auth/login`, { data: TEST_AGENT });
  expect(agentLogin.status()).toBe(200);
  const agentAuth = await agentLogin.json();
  const customerHeaders = { Authorization: `Bearer ${customerAuth.accessToken}` };
  const agentHeaders = { Authorization: `Bearer ${agentAuth.accessToken}` };

  const conversationResponse = await request.post(`${BACKEND_URL}/api/conversations`, {
    headers: customerHeaders,
  });
  expect(conversationResponse.status()).toBe(201);
  const { conversation } = await conversationResponse.json();

  const ticketResponse = await request.post(`${BACKEND_URL}/api/tickets`, {
    headers: customerHeaders,
    data: {
      conversationId: conversation.id,
      subject: `E2E agent reply ${Date.now()}`,
      description: 'API-only agent reply test',
      priority: 'MEDIUM',
    },
  });
  expect(ticketResponse.status()).toBe(201);
  const { ticket } = await ticketResponse.json();

  const assignmentResponse = await request.patch(`${BACKEND_URL}/api/tickets/${ticket.id}/assign`, {
    headers: agentHeaders,
    data: { agentId: agentAuth.user.id },
  });
  expect(assignmentResponse.status()).toBe(200);

  const messageUrl = `${BACKEND_URL}/api/conversations/${conversation.id}/agent-messages`;
  const agentReply = await request.post(messageUrl, {
    headers: agentHeaders,
    data: { content: 'I can help with this request.' },
  });
  expect(agentReply.status()).toBe(201);

  const historyUrl = `${BACKEND_URL}/api/conversations/${conversation.id}/messages`;
  const historyResponse = await request.get(historyUrl, { headers: customerHeaders });
  expect(historyResponse.status()).toBe(200);
  const { messages } = await historyResponse.json();
  expect(messages).toEqual(expect.arrayContaining([
    expect.objectContaining({
      senderType: 'AGENT',
      senderId: agentAuth.user.id,
      content: 'I can help with this request.',
    }),
  ]));

  const secondCustomerCredentials = {
    email: `e2e-${Date.now()}@example.com`,
    password: 'DevPassword123!',
  };
  const secondCustomerRegistration = await request.post(`${BACKEND_URL}/api/auth/register`, {
    data: { ...secondCustomerCredentials, name: 'E2E Other Customer' },
  });
  expect(secondCustomerRegistration.status()).toBe(201);
  const secondCustomerLogin = await request.post(`${BACKEND_URL}/api/auth/login`, {
    data: secondCustomerCredentials,
  });
  expect(secondCustomerLogin.status()).toBe(200);
  const secondCustomerAuth = await secondCustomerLogin.json();
  const unauthorizedHistory = await request.get(historyUrl, {
    headers: { Authorization: `Bearer ${secondCustomerAuth.accessToken}` },
  });
  expect(unauthorizedHistory.status()).toBe(404);

  const notificationsResponse = await request.get(`${BACKEND_URL}/api/notifications`, {
    headers: customerHeaders,
  });
  expect(notificationsResponse.status()).toBe(200);
  const { notifications } = await notificationsResponse.json();
  expect(notifications).toEqual(expect.arrayContaining([
    expect.objectContaining({
      type: 'AGENT_REPLIED',
      payload: expect.objectContaining({ resourceId: conversation.id }),
    }),
  ]));

  const customerReply = await request.post(messageUrl, {
    headers: customerHeaders,
    data: { content: 'I should not be allowed to reply as an agent.' },
  });
  expect(customerReply.status()).toBe(403);

  const resolutionResponse = await request.patch(`${BACKEND_URL}/api/tickets/${ticket.id}/status`, {
    headers: agentHeaders,
    data: { status: 'RESOLVED' },
  });
  expect(resolutionResponse.status()).toBe(200);

  const resolvedReply = await request.post(messageUrl, {
    headers: agentHeaders,
    data: { content: 'This reply should be rejected.' },
  });
  expect(resolvedReply.status()).toBe(409);
});