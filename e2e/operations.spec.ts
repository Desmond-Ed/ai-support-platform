import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext } from '@playwright/test';
import { BACKEND_URL, LLM_STUB_CONTROL_URL, SEEDED_USERS } from './support/config';
import {
  apiCreateConversation,
  apiCreateTicket,
  apiLogin,
  apiRegisterCustomer,
  apiUpdateTicketStatus,
  type AuthSession,
} from './support/api';
import { loginSeeded } from './support/fixtures';

test.describe.configure({ mode: 'serial' });

const RETRY_EMBEDDING_INPUT_COUNT = 13;

type KnowledgeStatus = 'PENDING' | 'PROCESSING' | 'READY' | 'FAILED';
type ModerationStatus = 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | 'ARCHIVED';

type KnowledgeDocument = {
  id: string;
  title: string;
  status: KnowledgeStatus;
  moderationStatus: ModerationStatus;
  moderationReason: string | null;
  moderationVersion: number;
  ingestionAttempt: number;
  errorMessage: string | null;
};

type AuditLog = {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata: Record<string, unknown> | null;
  actor: { id: string; email: string; name: string } | null;
  createdAt: string;
};

function adminHeaders(session: AuthSession) {
  return { Authorization: `Bearer ${session.accessToken}` };
}

async function createKnowledge(
  request: APIRequestContext,
  admin: AuthSession,
  content: string,
): Promise<KnowledgeDocument> {
  const title = `E2E operations ${randomUUID()}`;
  const response = await request.post(`${BACKEND_URL}/api/knowledge`, {
    headers: adminHeaders(admin),
    data: { title, content, sourceType: 'MANUAL' },
  });
  expect(response.status()).toBe(201);
  return ((await response.json()) as { document: KnowledgeDocument }).document;
}

async function getKnowledge(
  request: APIRequestContext,
  admin: AuthSession,
  title: string,
): Promise<KnowledgeDocument> {
  const response = await request.get(
    `${BACKEND_URL}/api/admin/knowledge?search=${encodeURIComponent(title)}`,
    { headers: adminHeaders(admin) },
  );
  expect(response.status()).toBe(200);
  const body = (await response.json()) as { documents: KnowledgeDocument[] };
  const document = body.documents[0];
  expect(document, `knowledge document ${title}`).toBeTruthy();
  return document;
}

async function waitForKnowledgeStatus(
  request: APIRequestContext,
  admin: AuthSession,
  title: string,
  expected: KnowledgeStatus,
): Promise<KnowledgeDocument> {
  await expect
    .poll(
      async () => {
        const document = await getKnowledge(request, admin, title);
        if (document.status === 'FAILED' && expected !== 'FAILED') {
          throw new Error(`Ingestion failed: ${document.errorMessage ?? 'unknown error'}`);
        }
        return document.status;
      },
      { timeout: 45_000, intervals: [250, 500, 1_000] },
    )
    .toBe(expected);
  return getKnowledge(request, admin, title);
}

async function moderate(
  request: APIRequestContext,
  admin: AuthSession,
  document: KnowledgeDocument,
  action: 'APPROVE' | 'REJECT' | 'ARCHIVE' | 'RESTORE',
  reason?: string,
) {
  return request.patch(
    `${BACKEND_URL}/api/admin/knowledge/${document.id}/moderation`,
    {
      headers: adminHeaders(admin),
      data: {
        action,
        expectedVersion: document.moderationVersion,
        ...(reason ? { reason } : {}),
      },
    },
  );
}

async function setEmbeddingFailure(
  request: APIRequestContext,
  fail: boolean,
): Promise<void> {
  const response = await request.post(`${LLM_STUB_CONTROL_URL}/control/fail-embeddings`, {
    data: fail
      ? { inputCount: RETRY_EMBEDDING_INPUT_COUNT }
      : { fail: false },
  });
  expect(response.status()).toBe(200);
}

async function auditLogs(
  request: APIRequestContext,
  admin: AuthSession,
  entityId: string,
): Promise<AuditLog[]> {
  const response = await request.get(
    `${BACKEND_URL}/api/admin/audit-logs?entityId=${entityId}&pageSize=100`,
    { headers: adminHeaders(admin) },
  );
  expect(response.status()).toBe(200);
  return ((await response.json()) as { logs: AuditLog[] }).logs;
}

test.describe('Knowledge moderation API', () => {
  test('enforces ready ingestion, optimistic versions, rejection reasons, and restoration audits', async ({
    request,
  }) => {
    const admin = await apiLogin(request, SEEDED_USERS.ADMIN);
    const document = await createKnowledge(
      request,
      admin,
      `Moderation workflow ${randomUUID()}\n\nRefund requests are reviewed after the return is received.`,
    );

    const ready = await waitForKnowledgeStatus(request, admin, document.title, 'READY');
    expect(ready.moderationStatus).toBe('PENDING_REVIEW');
    expect(ready.moderationVersion).toBe(0);

    const stale = await request.patch(
      `${BACKEND_URL}/api/admin/knowledge/${ready.id}/moderation`,
      {
        headers: adminHeaders(admin),
        data: { action: 'APPROVE', expectedVersion: 99 },
      },
    );
    expect(stale.status()).toBe(409);

    const missingReason = await moderate(request, admin, ready, 'REJECT');
    expect(missingReason.status()).toBe(400);

    const approvedResponse = await moderate(request, admin, ready, 'APPROVE');
    expect(approvedResponse.status()).toBe(200);
    const approved = ((await approvedResponse.json()) as { document: KnowledgeDocument }).document;
    expect(approved.moderationStatus).toBe('APPROVED');
    expect(approved.moderationVersion).toBe(1);

    const rejectedResponse = await moderate(
      request,
      admin,
      approved,
      'REJECT',
      'Superseded by a corrected policy',
    );
    expect(rejectedResponse.status()).toBe(200);
    const rejected = ((await rejectedResponse.json()) as { document: KnowledgeDocument }).document;
    expect(rejected.moderationStatus).toBe('REJECTED');
    expect(rejected.moderationReason).toBe('Superseded by a corrected policy');
    expect(rejected.moderationVersion).toBe(2);

    const restoredResponse = await moderate(request, admin, rejected, 'RESTORE');
    expect(restoredResponse.status()).toBe(200);
    const restored = ((await restoredResponse.json()) as { document: KnowledgeDocument }).document;
    expect(restored.moderationStatus).toBe('PENDING_REVIEW');
    expect(restored.moderationReason).toBeNull();
    expect(restored.moderationVersion).toBe(3);

    const logs = await auditLogs(request, admin, ready.id);
    expect(logs.map((log) => log.action)).toEqual(
      expect.arrayContaining([
        'KNOWLEDGE_SUBMITTED',
        'KNOWLEDGE_APPROVED',
        'KNOWLEDGE_REJECTED',
        'KNOWLEDGE_RESTORED',
      ]),
    );
    expect(logs.find((log) => log.action === 'KNOWLEDGE_REJECTED')?.metadata).toMatchObject({
      reason: 'Superseded by a corrected policy',
      previousModerationStatus: 'APPROVED',
      newModerationStatus: 'REJECTED',
    });
    expect(logs.every((log) => log.actor?.id === admin.user.id)).toBe(true);
  });

  test('recovers a deterministically failed ingestion with a unique retry and audit trail', async ({
    request,
  }) => {
    const admin = await apiLogin(request, SEEDED_USERS.ADMIN);
    await setEmbeddingFailure(request, true);
    const document = await createKnowledge(
      request,
      admin,
      Array.from(
        { length: RETRY_EMBEDDING_INPUT_COUNT },
        (_, index) => `Retry fixture section ${index + 1} ${randomUUID()}`,
      ).join('\n\n'),
    );

    const failed = await waitForKnowledgeStatus(request, admin, document.title, 'FAILED');
    expect(failed.ingestionAttempt).toBe(0);
    expect(failed.errorMessage).toBeTruthy();

    await setEmbeddingFailure(request, false);

    const retryResponse = await request.post(
      `${BACKEND_URL}/api/admin/knowledge/${failed.id}/retry`,
      {
        headers: adminHeaders(admin),
        data: { expectedVersion: failed.moderationVersion },
      },
    );
    expect(retryResponse.status()).toBe(202);
    const retryBody = (await retryResponse.json()) as { jobId: string };
    expect(retryBody.jobId).toBe(`knowledge-document-${failed.id}-retry-1`);

    const duplicateRetry = await request.post(
      `${BACKEND_URL}/api/admin/knowledge/${failed.id}/retry`,
      {
        headers: adminHeaders(admin),
        data: { expectedVersion: failed.moderationVersion },
      },
    );
    expect(duplicateRetry.status()).toBe(409);

    const ready = await waitForKnowledgeStatus(request, admin, document.title, 'READY');
    expect(ready.ingestionAttempt).toBe(1);
    expect(ready.moderationStatus).toBe('PENDING_REVIEW');
    expect(ready.errorMessage).toBeNull();

    const logs = await auditLogs(request, admin, failed.id);
    expect(logs.map((log) => log.action)).toEqual(
      expect.arrayContaining(['KNOWLEDGE_SUBMITTED', 'KNOWLEDGE_INGESTION_RETRY_REQUESTED']),
    );
    const retryAudit = logs.find((log) => log.action === 'KNOWLEDGE_INGESTION_RETRY_REQUESTED');
    expect(retryAudit?.metadata).toMatchObject({
      ingestionAttempt: 1,
      jobId: retryBody.jobId,
      previousStatus: 'FAILED',
      newStatus: 'PENDING',
    });
  });
});

test.describe('Operational analytics and ticket audit API', () => {
  test('resolves, retains, reopens, and rererecords ticket resolution timestamps with audits', async ({
    request,
  }) => {
    const admin = await apiLogin(request, SEEDED_USERS.ADMIN);
    const customer = await apiRegisterCustomer(request, 'operations-analytics');
    const conversation = await apiCreateConversation(request, customer.session.accessToken);
    const ticket = await apiCreateTicket(
      request,
      customer.session.accessToken,
      conversation.id,
      `E2E analytics ${randomUUID()}`,
    );

    const resolved = await apiUpdateTicketStatus(
      request,
      admin.accessToken,
      ticket.id,
      'RESOLVED',
    );
    expect(resolved.resolvedAt).toBeTruthy();
    const firstResolvedAt = resolved.resolvedAt;

    const closed = await apiUpdateTicketStatus(request, admin.accessToken, ticket.id, 'CLOSED');
    expect(closed.resolvedAt).toBe(firstResolvedAt);

    const reopened = await apiUpdateTicketStatus(request, admin.accessToken, ticket.id, 'OPEN');
    expect(reopened.resolvedAt).toBeNull();

    await apiUpdateTicketStatus(request, admin.accessToken, ticket.id, 'RESOLVED');

    const today = new Date().toISOString().slice(0, 10);
    const analyticsResponse = await request.get(
      `${BACKEND_URL}/api/analytics/timeseries?from=${today}&to=${today}`,
      { headers: adminHeaders(admin) },
    );
    expect(analyticsResponse.status()).toBe(200);
    const analytics = (await analyticsResponse.json()) as {
      range: { days: number };
      series: Array<{ ticketsResolved: number; averageResolutionSeconds: number | null }>;
      summary: { ticketsResolved: number };
    };
    expect(analytics.range.days).toBe(1);
    expect(analytics.series).toHaveLength(1);
    expect(analytics.series[0].ticketsResolved).toBeGreaterThanOrEqual(1);
    expect(analytics.series[0].averageResolutionSeconds).not.toBeNull();
    expect(analytics.summary.ticketsResolved).toBeGreaterThanOrEqual(1);

    const badRange = await request.get(
      `${BACKEND_URL}/api/analytics/timeseries?from=2026-01-02&to=2026-01-01`,
      { headers: adminHeaders(admin) },
    );
    expect(badRange.status()).toBe(400);

    const logs = await auditLogs(request, admin, ticket.id);
    expect(logs.filter((log) => log.action === 'TICKET_STATUS_CHANGED')).toHaveLength(4);
    expect(logs[0].metadata).toMatchObject({ newStatus: 'RESOLVED' });
  });
});

test.describe('Admin operations UI', () => {
  test('shows time-series analytics, approves knowledge, and filters audit events', async ({
    page,
    request,
  }) => {
    const admin = await apiLogin(request, SEEDED_USERS.ADMIN);
    const document = await createKnowledge(
      request,
      admin,
      `UI moderation ${randomUUID()}\n\nUI moderation content is never exposed in audit metadata.`,
    );
    await waitForKnowledgeStatus(request, admin, document.title, 'READY');

    await loginSeeded(page, 'ADMIN');

    await expect(page.getByTestId('analytics-day')).toHaveCount(30);
    const today = new Date().toISOString().slice(0, 10);
    await page.getByLabel('Analytics from').fill(today);
    await page.getByLabel('Analytics to').fill(today);
    const analyticsApplied = page.waitForResponse(
      (response) => response.url().includes(`/api/analytics/timeseries?from=${today}&to=${today}`),
    );
    await page.getByRole('button', { name: 'Apply', exact: true }).click();
    expect((await analyticsApplied).status()).toBe(200);
    await expect(page.getByTestId('analytics-day')).toHaveCount(1);
    const analyticsReapplied = page.waitForResponse(
      (response) => response.url().includes(`/api/analytics/timeseries?from=${today}&to=${today}`),
    );
    await page.getByRole('button', { name: 'Apply', exact: true }).click();
    expect((await analyticsReapplied).status()).toBe(200);
    await expect(page.getByTestId('analytics-day')).toHaveCount(1);
    await page.getByTestId('operations-tab-knowledge').click();

    const row = page.locator(
      `[data-testid="knowledge-row"][data-document-id="${document.id}"]`,
    );
    await expect(row).toBeVisible();
    await expect(row).toHaveAttribute('data-moderation-status', 'PENDING_REVIEW');
    await row.click();
    await expect(page.getByTestId('knowledge-approve')).toBeEnabled();

    const approveResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'PATCH' &&
        response.url().endsWith(`/api/admin/knowledge/${document.id}/moderation`),
    );
    await page.getByTestId('knowledge-approve').click();
    expect((await approveResponse).status()).toBe(200);
    await expect(row).toHaveAttribute('data-moderation-status', 'APPROVED');

    await page.getByTestId('operations-tab-audit').click();
    await page.getByLabel('Audit action filter').selectOption('KNOWLEDGE_APPROVED');
    const auditRow = page.locator(
      `[data-testid="audit-log-row"][data-action="KNOWLEDGE_APPROVED"]`,
    );
    await expect(auditRow.first()).toBeVisible();
    await expect(auditRow.first()).toContainText('KnowledgeDocument');
    await expect(auditRow.first()).not.toContainText('UI moderation content');
    await page.getByLabel('Audit from').fill(today);
    await page.getByLabel('Audit to').fill(today);
    const auditApplied = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname === '/api/admin/audit-logs' &&
        url.searchParams.get('from') === today && url.searchParams.get('to') === today;
    });
    await page.getByRole('button', { name: 'Apply dates', exact: true }).click();
    expect((await auditApplied).status()).toBe(200);
    await expect(auditRow.first()).toBeVisible();
  });

  test('customer and agent cannot reach admin audit or moderation endpoints', async ({ request }) => {
    for (const credentials of [SEEDED_USERS.CUSTOMER, SEEDED_USERS.AGENT]) {
      const session = await apiLogin(request, credentials);
      const audit = await request.get(`${BACKEND_URL}/api/admin/audit-logs`, {
        headers: adminHeaders(session),
      });
      expect(audit.status()).toBe(403);
      const knowledge = await request.get(`${BACKEND_URL}/api/admin/knowledge`, {
        headers: adminHeaders(session),
      });
      expect(knowledge.status()).toBe(403);
      const timeseries = await request.get(`${BACKEND_URL}/api/analytics/timeseries`, {
        headers: adminHeaders(session),
      });
      expect(timeseries.status()).toBe(credentials === SEEDED_USERS.CUSTOMER ? 403 : 200);
    }
  });
});
