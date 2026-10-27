import { randomUUID } from 'node:crypto';
import { request } from '@playwright/test';
import { BACKEND_URL, KNOWLEDGE_CONTENT, SEEDED_USERS } from './support/config';
import { apiLogin, type AuthSession } from './support/api';

type KnowledgeDocument = {
  id: string;
  title: string;
  status: 'PENDING' | 'PROCESSING' | 'READY' | 'FAILED';
  errorMessage: string | null;
  moderationStatus: 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | 'ARCHIVED';
  moderationVersion: number;
};

async function waitForKnowledgeReady(
  context: Awaited<ReturnType<typeof request.newContext>>,
  session: AuthSession,
  documentId: string,
): Promise<KnowledgeDocument> {
  const deadline = Date.now() + 60_000;

  while (Date.now() < deadline) {
    const response = await context.get(`${BACKEND_URL}/api/admin/knowledge`, {
      headers: { Authorization: `Bearer ${session.accessToken}` },
    });
    if (response.status() !== 200) {
      throw new Error(`Knowledge readiness check returned ${response.status()}`);
    }

    const body = (await response.json()) as { documents: KnowledgeDocument[] };
    const document = body.documents.find((item) => item.id === documentId);
    if (document?.status === 'READY') return document;
    if (document?.status === 'FAILED') {
      throw new Error(`Knowledge ingestion failed: ${document.errorMessage ?? 'unknown error'}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error('Timed out waiting for the deterministic knowledge fixture to become READY');
}

async function approveKnowledge(
  context: Awaited<ReturnType<typeof request.newContext>>,
  session: AuthSession,
  document: KnowledgeDocument,
): Promise<void> {
  const response = await context.patch(
    `${BACKEND_URL}/api/admin/knowledge/${document.id}/moderation`,
    {
      headers: { Authorization: `Bearer ${session.accessToken}` },
      data: { action: 'APPROVE', expectedVersion: document.moderationVersion },
    },
  );
  if (response.status() !== 200) {
    throw new Error(`Unable to approve the knowledge fixture: ${response.status()}`);
  }
}

export default async function globalSetup(): Promise<void> {
  const context = await request.newContext();
  try {
    const health = await context.get(`${BACKEND_URL}/api/health`);
    if (!health.ok()) {
      throw new Error(
        `Backend is not ready at ${BACKEND_URL}. Start the isolated E2E stack before running tests.`,
      );
    }

    const admin = await apiLogin(context, SEEDED_USERS.ADMIN);
    const createResponse = await context.post(`${BACKEND_URL}/api/knowledge`, {
      headers: { Authorization: `Bearer ${admin.accessToken}` },
      data: {
        title: `E2E refund fixture ${randomUUID()}`,
        content: KNOWLEDGE_CONTENT,
        sourceType: 'MANUAL',
      },
    });
    if (createResponse.status() !== 201) {
      throw new Error(`Unable to create the knowledge fixture: ${createResponse.status()}`);
    }

    const body = (await createResponse.json()) as { document: KnowledgeDocument };
    const ready = await waitForKnowledgeReady(context, admin, body.document.id);
    await approveKnowledge(context, admin, ready);
  } finally {
    await context.dispose();
  }
}
