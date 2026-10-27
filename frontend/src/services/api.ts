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

export type AnalyticsDay = {
  date: string;
  conversationsCreated: number;
  ticketsCreated: number;
  ticketsResolved: number;
  averageResolutionSeconds: number | null;
};

export type AnalyticsTimeseries = {
  range: { from: string; to: string; days: number };
  series: AnalyticsDay[];
  summary: {
    conversationsCreated: number;
    ticketsCreated: number;
    ticketsResolved: number;
    averageResolutionSeconds: number | null;
  };
};

export type KnowledgeModerationStatus = 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | 'ARCHIVED';
export type KnowledgeIngestionStatus = 'PENDING' | 'PROCESSING' | 'READY' | 'FAILED';

export type KnowledgeDocument = {
  id: string;
  title: string;
  sourceType: string;
  status: KnowledgeIngestionStatus;
  moderationStatus: KnowledgeModerationStatus;
  moderationReason: string | null;
  moderationVersion: number;
  ingestionAttempt: number;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  moderatedAt: string | null;
  uploadedBy: { id: string; email: string; name: string };
  moderatedBy: { id: string; email: string; name: string } | null;
};

export type KnowledgeDetail = KnowledgeDocument & { content: string };

export type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type AuditLog = {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  actor: { id: string; email: string; name: string } | null;
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

export type Conversation = {
  id: string;
  status: 'AI_HANDLING' | 'ESCALATED' | 'WITH_AGENT' | 'RESOLVED' | 'CLOSED';
  updatedAt: string;
};

export type ConversationMessage = {
  id: string;
  conversationId: string;
  senderType: 'CUSTOMER' | 'AGENT' | 'AI' | 'SYSTEM';
  senderId: string | null;
  content: string;
  createdAt: string;
  sources?: Array<{ title: string }> | null;
};

export type SendMessageResponse = {
  customerMessage: ConversationMessage;
  assistantMessage: ConversationMessage;
  degraded?: boolean;
};

async function request<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiUrl}/api${path}`, {
    ...init,
    credentials: 'include',
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
    credentials: 'include',
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

function queryString(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const encoded = search.toString();
  return encoded ? `?${encoded}` : '';
}

export const api = {
  logout: async () => {
    const response = await fetch(`${apiUrl}/api/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    });
    if (!response.ok) {
      throw new Error(`Request failed with ${response.status}`);
    }
  },
  login: (email: string, password: string) =>
    publicRequest<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  notifications: (token: string) => request<{ notifications: Notification[] }>(token, '/notifications'),
  markAllNotificationsRead: (token: string) =>
    request<{ count: number }>(token, '/notifications/read-all', { method: 'PATCH' }),
  analytics: (token: string) => request<{ overview: AnalyticsOverview }>(token, '/analytics/overview'),
  analyticsTimeseries: (token: string, params: { from?: string; to?: string } = {}) =>
    request<AnalyticsTimeseries>(token, `/analytics/timeseries${queryString(params)}`),
  adminKnowledge: (
    token: string,
    params: {
      status?: string;
      moderationStatus?: string;
      search?: string;
      page?: number;
      pageSize?: number;
    } = {},
  ) =>
    request<{ documents: KnowledgeDocument[]; pagination: Pagination }>(
      token,
      `/admin/knowledge${queryString(params)}`,
    ),
  adminKnowledgeDetail: (token: string, documentId: string) =>
    request<{ document: KnowledgeDetail }>(token, `/admin/knowledge/${documentId}`),
  moderateKnowledge: (
    token: string,
    documentId: string,
    payload: {
      action: 'APPROVE' | 'REJECT' | 'ARCHIVE' | 'RESTORE';
      expectedVersion: number;
      reason?: string;
    },
  ) =>
    request<{ document: KnowledgeDocument }>(token, `/admin/knowledge/${documentId}/moderation`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  retryKnowledgeIngestion: (token: string, documentId: string, expectedVersion: number) =>
    request<{ document: KnowledgeDocument; jobId: string }>(
      token,
      `/admin/knowledge/${documentId}/retry`,
      { method: 'POST', body: JSON.stringify({ expectedVersion }) },
    ),
  auditLogs: (
    token: string,
    params: {
      action?: string;
      actorId?: string;
      entityType?: string;
      entityId?: string;
      from?: string;
      to?: string;
      page?: number;
      pageSize?: number;
    } = {},
  ) =>
    request<{ logs: AuditLog[]; pagination: Pagination }>(
      token,
      `/admin/audit-logs${queryString(params)}`,
    ),
  tickets: (token: string, role: string) =>
    request<{ tickets: Ticket[] }>(token, role === 'CUSTOMER' ? '/tickets' : '/tickets/agent'),
  listConversations: (token: string) => request<{ conversations: Conversation[] }>(token, '/conversations'),
  createConversation: (token: string) => request<{ conversation: Conversation }>(token, '/conversations', { method: 'POST' }),
  requestHandoff: (token: string, conversationId: string) =>
    request<{ conversation: Conversation }>(token, `/conversations/${conversationId}/handoff`, { method: 'POST' }),
  getMessages: (token: string, conversationId: string) =>
    request<{ messages: ConversationMessage[] }>(token, `/conversations/${conversationId}/messages`),
  sendMessage: (token: string, conversationId: string, content: string) =>
    request<SendMessageResponse>(token, `/conversations/${conversationId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    }),
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