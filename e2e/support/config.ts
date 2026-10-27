export type Role = 'CUSTOMER' | 'AGENT' | 'ADMIN';

export type Credentials = {
  email: string;
  password: string;
};

export const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5174';
export const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:4001';
export const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8001';
export const LLM_STUB_CONTROL_URL =
  process.env.LLM_STUB_CONTROL_URL || 'http://localhost:8082';

export const E2E_PASSWORD = 'E2ePassword123!';

export const SEEDED_USERS: Record<Role, Credentials> = {
  CUSTOMER: {
    email: process.env.E2E_CUSTOMER_EMAIL || 'e2e.customer@example.com',
    password: E2E_PASSWORD,
  },
  AGENT: {
    email: process.env.E2E_AGENT_EMAIL || 'e2e.agent@example.com',
    password: E2E_PASSWORD,
  },
  ADMIN: {
    email: process.env.E2E_ADMIN_EMAIL || 'e2e.admin@example.com',
    password: E2E_PASSWORD,
  },
};

export const GROUNDED_ANSWER = 'Refunds are processed within 5 business days.';
export const KNOWLEDGE_CONTENT = `Refund policy

${GROUNDED_ANSWER} Refund requests are reviewed after the return is received.
`;
export const AI_OUTAGE_MARKER = 'SIMULATE_AI_OUTAGE';
