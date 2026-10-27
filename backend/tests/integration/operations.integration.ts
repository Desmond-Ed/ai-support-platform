import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { prisma } from '../../src/config/db.js';
import { KnowledgeModerationService } from '../../src/services/knowledgeModeration.service.js';
import { TicketService } from '../../src/services/ticket.service.js';
import { AnalyticsService } from '../../src/services/analytics.service.js';
import { AuditService } from '../../src/services/audit.service.js';
import { AdminService } from '../../src/services/admin.service.js';

const createdUserIds: string[] = [];
const createdEntityIds: string[] = [];

type AuditTransition = { from: string | null; to: string };

function followTransitionChain(
  transitions: AuditTransition[],
  start: string | null,
): Array<string | null> {
  const remaining = [...transitions];
  const chain: Array<string | null> = [start];
  let current = start;
  while (remaining.length > 0) {
    const index = remaining.findIndex((transition) => transition.from === current);
    if (index === -1) break;
    const [transition] = remaining.splice(index, 1);
    current = transition.to;
    chain.push(current);
  }
  return chain;
}

function auditMetadata(value: unknown): Record<string, unknown> {
  return value as Record<string, unknown>;
}

async function createUser(role: 'CUSTOMER' | 'AGENT' | 'ADMIN') {
  const user = await prisma.user.create({
    data: {
      email: `integration-${role.toLowerCase()}-${randomUUID()}@example.com`,
      name: `Integration ${role}`,
      passwordHash: 'not-used-in-integration-tests',
      role,
    },
  });
  createdUserIds.push(user.id);
  return user;
}

async function createDocument(
  uploadedById: string,
  overrides: { status?: 'PENDING' | 'PROCESSING' | 'READY' | 'FAILED' } = {},
) {
  const document = await prisma.knowledgeDocument.create({
    data: {
      title: `Integration document ${randomUUID()}`,
      content: 'Integration-only knowledge content.',
      sourceType: 'MANUAL',
      uploadedById,
      status: overrides.status ?? 'READY',
      moderationStatus: 'PENDING_REVIEW',
    },
  });
  createdEntityIds.push(document.id);
  return document;
}

async function createTicket(customerId: string) {
  const conversation = await prisma.conversation.create({
    data: { customerId },
  });
  const ticket = await prisma.ticket.create({
    data: {
      conversationId: conversation.id,
      customerId,
      subject: `Integration ticket ${randomUUID()}`,
    },
  });
  createdEntityIds.push(ticket.id);
  return { conversation, ticket };
}

beforeAll(async () => {
  await prisma.$queryRaw`SELECT 1`;
});

afterAll(async () => {
  await prisma.auditLog.deleteMany({
    where: {
      OR: [
        { entityId: { in: createdEntityIds } },
        { userId: { in: createdUserIds } },
      ],
    },
  });
  await prisma.knowledgeDocument.deleteMany({ where: { id: { in: createdEntityIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  await prisma.$disconnect();
});

describe('knowledge moderation persistence and concurrency', () => {
  it('permits exactly one concurrent approval for the same moderation version', async () => {
    const admin = await createUser('ADMIN');
    const document = await createDocument(admin.id);

    const results = await Promise.allSettled([
      KnowledgeModerationService.moderate(
        document.id,
        { action: 'APPROVE', expectedVersion: 0 },
        admin.id,
      ),
      KnowledgeModerationService.moderate(
        document.id,
        { action: 'APPROVE', expectedVersion: 0 },
        admin.id,
      ),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((result) => result.status === 'rejected');
    expect(rejected).toMatchObject({ status: 'rejected', reason: { statusCode: 409 } });

    const persisted = await prisma.knowledgeDocument.findUniqueOrThrow({
      where: { id: document.id },
    });
    expect(persisted.moderationStatus).toBe('APPROVED');
    expect(persisted.moderationVersion).toBe(1);
    expect(persisted.moderatedById).toBe(admin.id);

    const audits = await prisma.auditLog.findMany({
      where: { action: 'KNOWLEDGE_APPROVED', entityId: document.id },
    });
    expect(audits).toHaveLength(1);
  });

  it('rolls back the moderation mutation when audit persistence fails', async () => {
    const admin = await createUser('ADMIN');
    const document = await createDocument(admin.id);
    const auditSpy = vi
      .spyOn(AuditService, 'record')
      .mockRejectedValueOnce(new Error('forced audit failure'));

    await expect(
      KnowledgeModerationService.moderate(
        document.id,
        { action: 'APPROVE', expectedVersion: 0 },
        admin.id,
      ),
    ).rejects.toThrow('forced audit failure');
    auditSpy.mockRestore();

    const persisted = await prisma.knowledgeDocument.findUniqueOrThrow({
      where: { id: document.id },
    });
    expect(persisted.moderationStatus).toBe('PENDING_REVIEW');
    expect(persisted.moderationVersion).toBe(0);
    expect(persisted.moderatedById).toBeNull();
    const audits = await prisma.auditLog.findMany({
      where: { action: 'KNOWLEDGE_APPROVED', entityId: document.id },
    });
    expect(audits).toHaveLength(0);
  });

  it('rejects approval before successful ingestion and preserves status on stale versions', async () => {
    const admin = await createUser('ADMIN');
    const document = await createDocument(admin.id, { status: 'PENDING' });

    await expect(
      KnowledgeModerationService.moderate(
        document.id,
        { action: 'APPROVE', expectedVersion: 0 },
        admin.id,
      ),
    ).rejects.toMatchObject({ statusCode: 409 });

    await expect(
      KnowledgeModerationService.moderate(
        document.id,
        { action: 'REJECT', expectedVersion: 99, reason: 'Outdated state' },
        admin.id,
      ),
    ).rejects.toMatchObject({ statusCode: 409 });

    const persisted = await prisma.knowledgeDocument.findUniqueOrThrow({
      where: { id: document.id },
    });
    expect(persisted.moderationStatus).toBe('PENDING_REVIEW');
    expect(persisted.moderationVersion).toBe(0);
  });
});

describe('ticket resolution lifecycle with persisted audits', () => {
  it('serializes duplicate concurrent assignments and status transitions', async () => {
    const admin = await createUser('ADMIN');
    const agent = await createUser('AGENT');
    const customer = await createUser('CUSTOMER');
    const conversation = await prisma.conversation.create({
      data: { customerId: customer.id },
    });
    const ticket = await prisma.ticket.create({
      data: {
        conversationId: conversation.id,
        customerId: customer.id,
        subject: `Integration concurrency ${randomUUID()}`,
      },
    });
    createdEntityIds.push(ticket.id);

    const assignments = await Promise.all([
      TicketService.assignAgent(ticket.id, agent.id, admin.id),
      TicketService.assignAgent(ticket.id, agent.id, admin.id),
    ]);

    expect(assignments[0]?.id).toBe(assignments[1]?.id);
    expect(
      await prisma.ticketAssignment.count({
        where: { ticketId: ticket.id, unassignedAt: null },
      }),
    ).toBe(1);
    expect(
      await prisma.auditLog.count({
        where: { action: 'TICKET_ASSIGNED', entityId: ticket.id },
      }),
    ).toBe(1);

    const statuses = await Promise.all([
      TicketService.updateStatus(ticket.id, 'IN_PROGRESS', admin.id),
      TicketService.updateStatus(ticket.id, 'IN_PROGRESS', admin.id),
    ]);

    expect(statuses.every((result) => result.status === 'IN_PROGRESS')).toBe(true);
    const statusAudits = await prisma.auditLog.findMany({
      where: { action: 'TICKET_STATUS_CHANGED', entityId: ticket.id },
    });
    expect(statusAudits).toHaveLength(1);
    expect(statusAudits[0]?.metadata).toMatchObject({
      previousStatus: 'OPEN',
      newStatus: 'IN_PROGRESS',
    });
  });

  it('sets, retains, clears, and resets resolvedAt across status transitions', async () => {
    const admin = await createUser('ADMIN');
    const customer = await createUser('CUSTOMER');
    const conversation = await prisma.conversation.create({
      data: { customerId: customer.id },
    });
    const ticket = await prisma.ticket.create({
      data: {
        conversationId: conversation.id,
        customerId: customer.id,
        subject: `Integration resolution ${randomUUID()}`,
        status: 'OPEN',
        createdAt: new Date('2026-02-01T00:00:00.000Z'),
      },
    });
    createdEntityIds.push(ticket.id);

    const resolved = await TicketService.updateStatus(ticket.id, 'RESOLVED', admin.id);
    expect(resolved.status).toBe('RESOLVED');
    expect(resolved.resolvedAt).toBeTruthy();
    const firstResolution = resolved.resolvedAt!.getTime();

    const closed = await TicketService.updateStatus(ticket.id, 'CLOSED', admin.id);
    expect(closed.resolvedAt?.getTime()).toBe(firstResolution);

    const reopened = await TicketService.updateStatus(ticket.id, 'OPEN', admin.id);
    expect(reopened.resolvedAt).toBeNull();

    const rereresolved = await TicketService.updateStatus(ticket.id, 'RESOLVED', admin.id);
    expect(rereresolved.resolvedAt).toBeTruthy();
    expect(rereresolved.resolvedAt!.getTime()).toBeGreaterThanOrEqual(firstResolution);

    const audits = await prisma.auditLog.findMany({
      where: { action: 'TICKET_STATUS_CHANGED', entityId: ticket.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(audits).toHaveLength(4);
    expect(audits.map((audit) => audit.metadata)).toEqual([
      expect.objectContaining({ previousStatus: 'OPEN', newStatus: 'RESOLVED' }),
      expect.objectContaining({ previousStatus: 'RESOLVED', newStatus: 'CLOSED' }),
      expect.objectContaining({ previousStatus: 'CLOSED', newStatus: 'OPEN', resolvedAt: null }),
      expect.objectContaining({ previousStatus: 'OPEN', newStatus: 'RESOLVED' }),
    ]);
  });
});

describe('ticket transaction correctness', () => {
  it('keeps one active assignment and a contiguous audit chain for competing agent assignments', async () => {
    const admin = await createUser('ADMIN');
    const agentA = await createUser('AGENT');
    const agentB = await createUser('AGENT');
    const customer = await createUser('CUSTOMER');
    const { conversation, ticket } = await createTicket(customer.id);

    const results = await Promise.allSettled([
      TicketService.assignAgent(ticket.id, agentA.id, admin.id),
      TicketService.assignAgent(ticket.id, agentB.id, admin.id),
    ]);
    expect(results.every((result) => result.status === 'fulfilled')).toBe(true);

    const activeAssignments = await prisma.ticketAssignment.findMany({
      where: { ticketId: ticket.id, unassignedAt: null },
    });
    expect(activeAssignments).toHaveLength(1);
    const activeAssignment = activeAssignments[0]!;
    expect([agentA.id, agentB.id]).toContain(activeAssignment.agentId);

    const persistedConversation = await prisma.conversation.findUniqueOrThrow({
      where: { id: conversation.id },
    });
    expect(persistedConversation.agentId).toBe(activeAssignment.agentId);

    const audits = await prisma.auditLog.findMany({
      where: { action: 'TICKET_ASSIGNED', entityId: ticket.id },
    });
    expect(audits).toHaveLength(2);

    const chain = followTransitionChain(
      audits.map((audit) => {
        const metadata = auditMetadata(audit.metadata);
        return {
          from:
            typeof metadata.previousAgentId === 'string' ? metadata.previousAgentId : null,
          to: metadata.newAgentId as string,
        };
      }),
      null,
    );
    expect(chain).toHaveLength(3);
    expect(chain[0]).toBeNull();
    expect([...chain.slice(1)].sort()).toEqual([agentA.id, agentB.id].sort());
    expect(chain[2]).toBe(activeAssignment.agentId);
  });

  it('serializes competing status transitions into a chain starting at OPEN', async () => {
    const admin = await createUser('ADMIN');
    const customer = await createUser('CUSTOMER');
    const { ticket } = await createTicket(customer.id);
    expect(ticket.status).toBe('OPEN');

    const results = await Promise.allSettled([
      TicketService.updateStatus(ticket.id, 'IN_PROGRESS', admin.id),
      TicketService.updateStatus(ticket.id, 'CLOSED', admin.id),
    ]);
    expect(results.every((result) => result.status === 'fulfilled')).toBe(true);

    const audits = await prisma.auditLog.findMany({
      where: { action: 'TICKET_STATUS_CHANGED', entityId: ticket.id },
    });
    expect(audits).toHaveLength(2);

    const chain = followTransitionChain(
      audits.map((audit) => {
        const metadata = auditMetadata(audit.metadata);
        return {
          from: metadata.previousStatus as string,
          to: metadata.newStatus as string,
        };
      }),
      'OPEN',
    );
    expect(chain).toHaveLength(3);
    expect(chain[0]).toBe('OPEN');
    expect([...chain.slice(1)].sort()).toEqual(['CLOSED', 'IN_PROGRESS']);

    const persisted = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
    expect(persisted.status).toBe(chain[2]);
  });

  it('rolls back an assignment when audit persistence fails', async () => {
    const admin = await createUser('ADMIN');
    const initialAgent = await createUser('AGENT');
    const nextAgent = await createUser('AGENT');
    const customer = await createUser('CUSTOMER');
    const { conversation, ticket } = await createTicket(customer.id);

    const initialAssignment = await prisma.ticketAssignment.create({
      data: { ticketId: ticket.id, agentId: initialAgent.id },
    });
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { agentId: initialAgent.id, status: 'WITH_AGENT' },
    });

    const assignmentsBefore = await prisma.ticketAssignment.findMany({
      where: { ticketId: ticket.id },
      orderBy: { id: 'asc' },
    });
    const conversationBefore = await prisma.conversation.findUniqueOrThrow({
      where: { id: conversation.id },
    });

    const auditSpy = vi
      .spyOn(AuditService, 'record')
      .mockRejectedValueOnce(new Error('forced assignment audit failure'));
    try {
      await expect(
        TicketService.assignAgent(ticket.id, nextAgent.id, admin.id),
      ).rejects.toThrow('forced assignment audit failure');
    } finally {
      auditSpy.mockRestore();
    }

    const assignmentsAfter = await prisma.ticketAssignment.findMany({
      where: { ticketId: ticket.id },
      orderBy: { id: 'asc' },
    });
    expect(assignmentsAfter).toEqual(assignmentsBefore);
    expect(assignmentsAfter).toHaveLength(1);
    expect(assignmentsAfter[0]).toMatchObject({
      id: initialAssignment.id,
      agentId: initialAgent.id,
      unassignedAt: null,
    });

    const conversationAfter = await prisma.conversation.findUniqueOrThrow({
      where: { id: conversation.id },
    });
    expect(conversationAfter).toEqual(conversationBefore);
    expect(conversationAfter.agentId).toBe(initialAgent.id);
    expect(
      await prisma.auditLog.count({
        where: { action: 'TICKET_ASSIGNED', entityId: ticket.id },
      }),
    ).toBe(0);
  });

  it('rolls back ticket and conversation resolution when audit persistence fails', async () => {
    const admin = await createUser('ADMIN');
    const customer = await createUser('CUSTOMER');
    const { conversation, ticket } = await createTicket(customer.id);

    await prisma.ticket.update({
      where: { id: ticket.id },
      data: { status: 'IN_PROGRESS' },
    });
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { status: 'WITH_AGENT' },
    });

    const ticketBefore = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
    const conversationBefore = await prisma.conversation.findUniqueOrThrow({
      where: { id: conversation.id },
    });

    const auditSpy = vi
      .spyOn(AuditService, 'record')
      .mockRejectedValueOnce(new Error('forced status audit failure'));
    try {
      await expect(
        TicketService.updateStatus(ticket.id, 'RESOLVED', admin.id),
      ).rejects.toThrow('forced status audit failure');
    } finally {
      auditSpy.mockRestore();
    }

    const ticketAfter = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
    const conversationAfter = await prisma.conversation.findUniqueOrThrow({
      where: { id: conversation.id },
    });
    expect(ticketAfter).toEqual(ticketBefore);
    expect(ticketAfter.status).toBe('IN_PROGRESS');
    expect(ticketAfter.resolvedAt).toBeNull();
    expect(conversationAfter).toEqual(conversationBefore);
    expect(conversationAfter.status).toBe('WITH_AGENT');
    expect(conversationAfter.resolvedAt).toBeNull();
    expect(
      await prisma.auditLog.count({
        where: { action: 'TICKET_STATUS_CHANGED', entityId: ticket.id },
      }),
    ).toBe(0);
  });
});

describe('admin user administration with persisted audits', () => {
  it('audits only effective changes and never returns password hashes', async () => {
    const admin = await createUser('ADMIN');
    const customer = await createUser('CUSTOMER');

    const updated = await AdminService.updateUser(customer.id, { role: 'AGENT' }, admin.id);
    expect(updated).toMatchObject({ id: customer.id, role: 'AGENT' });
    expect(updated).not.toHaveProperty('passwordHash');

    const audits = await prisma.auditLog.findMany({
      where: { action: 'USER_UPDATED', entityId: customer.id },
    });
    expect(audits).toHaveLength(1);
    expect(audits[0]?.metadata).toMatchObject({
      previousRole: 'CUSTOMER',
      newRole: 'AGENT',
      previousIsActive: true,
      newIsActive: true,
    });

    const noOp = await AdminService.updateUser(customer.id, { role: 'AGENT' }, admin.id);
    expect(noOp).not.toHaveProperty('passwordHash');
    expect(
      await prisma.auditLog.count({
        where: { action: 'USER_UPDATED', entityId: customer.id },
      }),
    ).toBe(1);
  });
});

describe('time-series analytics against persisted rows', () => {
  it('aggregates UTC days, zero-fills gaps, and computes duration averages', async () => {
    const customer = await createUser('CUSTOMER');

    await prisma.conversation.createMany({
      data: [
        {
          customerId: customer.id,
          createdAt: new Date('2026-01-01T01:00:00.000Z'),
        },
        {
          customerId: customer.id,
          createdAt: new Date('2026-01-01T23:59:59.000Z'),
        },
      ],
    });

    const resolvedTicket = await prisma.ticket.create({
      data: {
        conversationId: (
          await prisma.conversation.create({
            data: {
              customerId: customer.id,
              createdAt: new Date('2025-12-31T23:00:00.000Z'),
            },
          })
        ).id,
        customerId: customer.id,
        subject: `Integration analytics ${randomUUID()}`,
        status: 'RESOLVED',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        resolvedAt: new Date('2026-01-02T12:00:00.000Z'),
      },
    });
    createdEntityIds.push(resolvedTicket.id);

    const createdTicket = await prisma.ticket.create({
      data: {
        conversationId: resolvedTicket.conversationId,
        customerId: customer.id,
        subject: `Integration analytics open ${randomUUID()}`,
        status: 'OPEN',
        createdAt: new Date('2026-01-03T08:00:00.000Z'),
      },
    });
    createdEntityIds.push(createdTicket.id);

    const result = await AnalyticsService.timeseries({
      from: '2026-01-01',
      to: '2026-01-03',
    });

    expect(result.range).toEqual({ from: '2026-01-01', to: '2026-01-03', days: 3 });
    expect(result.series.map((day) => day.date)).toEqual([
      '2026-01-01',
      '2026-01-02',
      '2026-01-03',
    ]);
    expect(result.series[0]).toMatchObject({
      conversationsCreated: 2,
      ticketsCreated: 1,
      ticketsResolved: 0,
      averageResolutionSeconds: null,
    });
    expect(result.series[1]).toMatchObject({
      conversationsCreated: 0,
      ticketsCreated: 0,
      ticketsResolved: 1,
      averageResolutionSeconds: 129_600,
    });
    expect(result.series[2]).toMatchObject({
      conversationsCreated: 0,
      ticketsCreated: 1,
      ticketsResolved: 0,
    });
    expect(result.summary).toMatchObject({
      conversationsCreated: 2,
      ticketsCreated: 2,
      ticketsResolved: 1,
      averageResolutionSeconds: 129_600,
    });
  });
});
