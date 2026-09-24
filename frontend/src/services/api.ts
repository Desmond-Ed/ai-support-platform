const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:4000';

export type AuthResponse = {
  accessToken: string;
  user: { id: string; email: string; name: string; role: string };
};

export type Notification = {
  id: string;
  type: string;
  payload: { message?: string; resourceId?: string };
  read: boolean;
  createdAt: string;
};

export type AnalyticsOverview = {
  conversations: number;
  resolvedByAI: number;
  aiResolutionRate: number;
  unreadNotifications: number;
  ticketsByStatus: Array<{ status: string; _count: { _all: number } }>;
  knowledgeByStatus: Array<{ status: string; _count: { _all: number } }>;
};

export type Ticket = {
  id: string;
  subject: string;
  description: string | null;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
  createdAt: string;
  updatedAt: string;
};

async function request<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiUrl}/api${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(body?.error?.message || `Request failed with ${response.status}`);
  }
  return response.json() as Promise<T>;
}

async function publicRequest<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(`${apiUrl}/api${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(body?.error?.message || `Request failed with ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export const api = {
  login: (email: string, password: string) =>
    publicRequest<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  notifications: (token: string) => request<{ notifications: Notification[] }>(token, '/notifications'),
  markAllNotificationsRead: (token: string) =>
    request<{ count: number }>(token, '/notifications/read-all', { method: 'PATCH' }),
  analytics: (token: string) => request<{ overview: AnalyticsOverview }>(token, '/analytics/overview'),
  tickets: (token: string, role: string) =>
    request<{ tickets: Ticket[] }>(token, role === 'CUSTOMER' ? '/tickets' : '/tickets/agent'),
  createConversation: (token: string) => request<{ conversation: { id: string } }>(token, '/conversations', { method: 'POST' }),
  createTicket: (token: string, payload: { conversationId: string; subject: string; description: string; priority: Ticket['priority'] }) =>
    request<{ ticket: Ticket }>(token, '/tickets', { method: 'POST', body: JSON.stringify(payload) }),
  updateTicketStatus: (token: string, ticketId: string, status: Ticket['status']) =>
    request<{ ticket: Ticket }>(token, `/tickets/${ticketId}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  assignTicket: (token: string, ticketId: string, agentId: string) =>
    request<{ assignment: { ticketId: string; agentId: string } }>(token, `/tickets/${ticketId}/assign`, {
      method: 'PATCH',
      body: JSON.stringify({ agentId }),
    }),
};