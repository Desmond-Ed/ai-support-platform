import { randomUUID } from 'node:crypto';
import { expect, type APIRequestContext } from '@playwright/test';
import { BACKEND_URL, E2E_PASSWORD, type Credentials, type Role } from './config';

export type AuthSession = {
  accessToken: string;
  user: {
    id: string;
    email: string;
    name: string;
    role: Role;
  };
};

export type Conversation = {
  id: string;
  customerId: string;
  agentId: string | null;
  status: 'AI_HANDLING' | 'ESCALATED' | 'WITH_AGENT' | 'RESOLVED' | 'CLOSED';
};

export type Ticket = {
  id: string;
  conversationId: string;
  customerId: string;
  subject: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  resolvedAt?: string | null;
};

export type Message = {
  id: string;
  conversationId: string;
  senderType: 'CUSTOMER' | 'AI' | 'AGENT' | 'SYSTEM';
  senderId: string | null;
  content: string;
};

export type Notification = {
  id: string;
  type: string;
  payload: { message?: string; resourceId?: string };
  read: boolean;
};

export function uniqueEmail(prefix: string): string {
  return `${prefix}-${randomUUID()}@example.com`;
}

export async function apiLogin(
  request: APIRequestContext,
  credentials: Credentials,
): Promise<AuthSession> {
  const response = await request.post(`${BACKEND_URL}/api/auth/login`, {
    data: credentials,
  });
  expect(response.status(), `login ${credentials.email}`).toBe(200);
  return (await response.json()) as AuthSession;
}

export async function apiRegisterCustomer(
  request: APIRequestContext,
  prefix = 'e2e-customer',
): Promise<{ credentials: Credentials; session: AuthSession }> {
  const credentials = { email: uniqueEmail(prefix), password: E2E_PASSWORD };
  const response = await request.post(`${BACKEND_URL}/api/auth/register`, {
    data: { ...credentials, name: `E2E ${prefix}` },
  });
  expect(response.status(), `register ${credentials.email}`).toBe(201);
  const session = (await response.json()) as AuthSession;
  return { credentials, session };
}

export async function apiCreateAgent(
  request: APIRequestContext,
  adminSession: AuthSession,
  prefix = 'e2e-agent',
): Promise<{ credentials: Credentials; session: AuthSession; id: string }> {
  const { credentials, session: customerSession } = await apiRegisterCustomer(request, prefix);
  const updateResponse = await request.patch(
    `${BACKEND_URL}/api/admin/users/${customerSession.user.id}`,
    {
      headers: { Authorization: `Bearer ${adminSession.accessToken}` },
      data: { role: 'AGENT' },
    },
  );
  expect(updateResponse.status(), `promote ${credentials.email}`).toBe(200);
  const session = await apiLogin(request, credentials);
  expect(session.user.role).toBe('AGENT');
  return { credentials, session, id: session.user.id };
}

export async function apiCreateConversation(
  request: APIRequestContext,
  token: string,
): Promise<Conversation> {
  const response = await request.post(`${BACKEND_URL}/api/conversations`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(response.status()).toBe(201);
  const body = (await response.json()) as { conversation: Conversation };
  return body.conversation;
}

export async function apiCreateTicket(
  request: APIRequestContext,
  token: string,
  conversationId: string,
  subject: string,
): Promise<Ticket> {
  const response = await request.post(`${BACKEND_URL}/api/tickets`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      conversationId,
      subject,
      description: 'API setup for an E2E workflow test',
      priority: 'MEDIUM',
    },
  });
  expect(response.status()).toBe(201);
  const body = (await response.json()) as { ticket: Ticket };
  return body.ticket;
}

export async function apiAssignTicket(
  request: APIRequestContext,
  token: string,
  ticketId: string,
  agentId: string,
): Promise<void> {
  const response = await request.patch(`${BACKEND_URL}/api/tickets/${ticketId}/assign`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { agentId },
  });
  expect(response.status()).toBe(200);
}

export async function apiUpdateTicketStatus(
  request: APIRequestContext,
  token: string,
  ticketId: string,
  status: Ticket['status'],
): Promise<Ticket> {
  const response = await request.patch(`${BACKEND_URL}/api/tickets/${ticketId}/status`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { status },
  });
  expect(response.status()).toBe(200);
  const body = (await response.json()) as { ticket: Ticket };
  return body.ticket;
}

export async function apiGetTickets(
  request: APIRequestContext,
  token: string,
): Promise<Ticket[]> {
  const response = await request.get(`${BACKEND_URL}/api/tickets`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(response.status()).toBe(200);
  const body = (await response.json()) as { tickets: Ticket[] };
  return body.tickets;
}

export async function apiGetAgentTickets(
  request: APIRequestContext,
  token: string,
): Promise<Ticket[]> {
  const response = await request.get(`${BACKEND_URL}/api/tickets/agent`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(response.status()).toBe(200);
  const body = (await response.json()) as { tickets: Ticket[] };
  return body.tickets;
}

export async function apiGetConversations(
  request: APIRequestContext,
  token: string,
): Promise<Conversation[]> {
  const response = await request.get(`${BACKEND_URL}/api/conversations`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(response.status()).toBe(200);
  const body = (await response.json()) as { conversations: Conversation[] };
  return body.conversations;
}

export async function apiGetMessages(
  request: APIRequestContext,
  token: string,
  conversationId: string,
): Promise<Message[]> {
  const response = await request.get(
    `${BACKEND_URL}/api/conversations/${conversationId}/messages`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  expect(response.status()).toBe(200);
  const body = (await response.json()) as { messages: Message[] };
  return body.messages;
}

export async function apiPostAgentMessage(
  request: APIRequestContext,
  token: string,
  conversationId: string,
  content: string,
): Promise<Message> {
  const response = await request.post(
    `${BACKEND_URL}/api/conversations/${conversationId}/agent-messages`,
    {
      headers: { Authorization: `Bearer ${token}` },
      data: { content },
    },
  );
  expect(response.status()).toBe(201);
  const body = (await response.json()) as { message: Message };
  return body.message;
}

export async function apiGetNotifications(
  request: APIRequestContext,
  token: string,
): Promise<Notification[]> {
  const response = await request.get(`${BACKEND_URL}/api/notifications`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(response.status()).toBe(200);
  const body = (await response.json()) as { notifications: Notification[] };
  return body.notifications;
}
