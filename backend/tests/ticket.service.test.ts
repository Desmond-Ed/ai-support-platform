import { beforeEach, describe, expect, it, vi } from 'vitest';

const ticketRepository = vi.hoisted(() => ({
  findByCustomerId: vi.fn(),
  findByAgentId: vi.fn(),
  findById: vi.fn(),
  lockById: vi.fn(),
  create: vi.fn(),
  findActiveAssignment: vi.fn(),
  unassignActive: vi.fn(),
  createAssignment: vi.fn(),
  updateStatus: vi.fn(),
  setResolvedAt: vi.fn(),
  setAvailability: vi.fn(),
}));

const transactionClient = vi.hoisted(() => ({}));
const prisma = vi.hoisted(() => ({ $transaction: vi.fn() }));

const conversationRepository = vi.hoisted(() => ({
  findByIdForCustomer: vi.fn(),
  assignAgent: vi.fn(),
  updateStatus: vi.fn(),
  updateResolved: vi.fn(),
}));

const notificationService = vi.hoisted(() => ({
  create: vi.fn(),
}));

const auditService = vi.hoisted(() => ({
  record: vi.fn(),
}));

const userRepository = vi.hoisted(() => ({
  findById: vi.fn(),
}));

vi.mock('../src/repositories/TicketRepository.js', () => ({
  TicketRepository: ticketRepository,
}));
vi.mock('../src/config/db.js', () => ({ prisma }));

vi.mock('../src/repositories/ConversationRepository.js', () => ({
  ConversationRepository: conversationRepository,
}));
vi.mock('../src/repositories/UserRepository.js', () => ({
  UserRepository: userRepository,
}));

vi.mock('../src/services/notification.service.js', () => ({
  NotificationService: notificationService,
}));
vi.mock('../src/services/audit.service.js', () => ({
  AuditService: auditService,
}));

import { TicketService } from '../src/services/ticket.service.js';

beforeEach(() => {
  vi.resetAllMocks();
  prisma.$transaction.mockImplementation((callback) => callback(transactionClient));
  userRepository.findById.mockResolvedValue({ id: 'agent-1', role: 'AGENT', isActive: true });
  notificationService.create.mockResolvedValue({ id: 'notification-1' });
  auditService.record.mockResolvedValue({ id: 'audit-1' });
  ticketRepository.findActiveAssignment.mockResolvedValue(null);
  ticketRepository.lockById.mockResolvedValue(undefined);
  ticketRepository.unassignActive.mockResolvedValue(0);
});

describe('TicketService', () => {
  it('lists tickets for a customer', async () => {
    const tickets = [{ id: 'ticket-1', customerId: 'customer-1' }];
    ticketRepository.findByCustomerId.mockResolvedValue(tickets);

    const result = await TicketService.listForCustomer('customer-1');

    expect(result).toBe(tickets);
    expect(ticketRepository.findByCustomerId).toHaveBeenCalledWith('customer-1');
  });

  it('creates a ticket only for the customer-owned conversation', async () => {
    const ticket = {
      id: 'ticket-1',
      customerId: 'customer-1',
      conversationId: 'conversation-1',
      subject: 'Billing issue',
      description: 'Refund request',
      status: 'OPEN',
      priority: 'HIGH',
    };

    conversationRepository.findByIdForCustomer.mockResolvedValue({ id: 'conversation-1', customerId: 'customer-1' });
    ticketRepository.create.mockResolvedValue(ticket);

    const result = await TicketService.createForCustomer('customer-1', 'conversation-1', {
      subject: 'Billing issue',
      description: 'Refund request',
      priority: 'HIGH',
    });

    expect(result).toBe(ticket);
    expect(ticketRepository.create).toHaveBeenCalledWith({
      conversationId: 'conversation-1',
      customerId: 'customer-1',
      subject: 'Billing issue',
      description: 'Refund request',
      priority: 'HIGH',
      status: 'OPEN',
    });
  });

  it('assigns an agent and records the assignment transactionally', async () => {
    const ticket = { id: 'ticket-1', conversationId: 'conversation-1', status: 'OPEN' };
    const assignment = { id: 'assignment-1', ticketId: 'ticket-1', agentId: 'agent-1' };
    ticketRepository.findById.mockResolvedValue(ticket);
    ticketRepository.createAssignment.mockResolvedValue(assignment);

    const result = await TicketService.assignAgent('ticket-1', 'agent-1', 'actor-1');

    expect(result).toEqual(assignment);
    expect(userRepository.findById).toHaveBeenCalledWith('agent-1');
    expect(ticketRepository.lockById).toHaveBeenCalledWith('ticket-1', transactionClient);
    expect(ticketRepository.unassignActive).toHaveBeenCalledWith('ticket-1', expect.any(Date), transactionClient);
    expect(ticketRepository.createAssignment).toHaveBeenCalledWith('ticket-1', 'agent-1', transactionClient);
    expect(conversationRepository.assignAgent).toHaveBeenCalledWith(
      'conversation-1',
      'agent-1',
      transactionClient,
    );
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'actor-1',
        action: 'TICKET_ASSIGNED',
        entityId: 'ticket-1',
      }),
      transactionClient,
    );
  });

  it('does not audit or notify when the same agent is already assigned', async () => {
    ticketRepository.findById.mockResolvedValue({
      id: 'ticket-1',
      conversationId: 'conversation-1',
      status: 'OPEN',
    });
    ticketRepository.findActiveAssignment.mockResolvedValue({
      id: 'assignment-1',
      ticketId: 'ticket-1',
      agentId: 'agent-1',
    });

    const result = await TicketService.assignAgent('ticket-1', 'agent-1', 'actor-1');

    expect(result).toEqual({ id: 'assignment-1', ticketId: 'ticket-1', agentId: 'agent-1' });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(auditService.record).not.toHaveBeenCalled();
    expect(notificationService.create).not.toHaveBeenCalled();
  });

  it('rejects assignment to a non-agent user', async () => {
    ticketRepository.findById.mockResolvedValue({ id: 'ticket-1', conversationId: 'conversation-1' });
    userRepository.findById.mockResolvedValue({ id: 'customer-1', role: 'CUSTOMER', isActive: true });

    await expect(TicketService.assignAgent('ticket-1', 'customer-1', 'actor-1')).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(ticketRepository.createAssignment).not.toHaveBeenCalled();
  });

  it('lists assigned tickets for an agent', async () => {
    const tickets = [{ id: 'ticket-1', customerId: 'customer-1', status: 'OPEN' }];
    ticketRepository.findByAgentId.mockResolvedValue(tickets);

    const result = await TicketService.listForAgent('agent-1');

    expect(result).toBe(tickets);
    expect(ticketRepository.findByAgentId).toHaveBeenCalledWith('agent-1');
  });

  it('updates status, audits the transition, and clears resolvedAt when reopened', async () => {
    const ticket = { id: 'ticket-1', customerId: 'customer-1', status: 'OPEN' };
    const updated = { ...ticket, status: 'IN_PROGRESS', resolvedAt: null };
    ticketRepository.findById.mockResolvedValue(ticket);
    ticketRepository.updateStatus.mockResolvedValue(updated);

    const result = await TicketService.updateStatus('ticket-1', 'IN_PROGRESS', 'actor-1');

    expect(result).toEqual(updated);
    expect(ticketRepository.updateStatus).toHaveBeenCalledWith('ticket-1', 'IN_PROGRESS', transactionClient);
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'actor-1',
        action: 'TICKET_STATUS_CHANGED',
        metadata: expect.objectContaining({ previousStatus: 'OPEN', newStatus: 'IN_PROGRESS' }),
      }),
      transactionClient,
    );
  });

  it('does not audit or notify a no-op status update', async () => {
    const ticket = { id: 'ticket-1', customerId: 'customer-1', status: 'IN_PROGRESS' };
    ticketRepository.findById.mockResolvedValue(ticket);

    const result = await TicketService.updateStatus('ticket-1', 'IN_PROGRESS', 'actor-1');

    expect(result).toBe(ticket);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(notificationService.create).not.toHaveBeenCalled();
  });

  it('sends a resolved notification and records resolution when a ticket resolves', async () => {
    const ticket = {
      id: 'ticket-1',
      conversationId: 'conversation-1',
      customerId: 'customer-1',
      status: 'OPEN',
    };
    const resolvedAt = new Date();
    ticketRepository.findById.mockResolvedValue(ticket);
    ticketRepository.setResolvedAt.mockResolvedValue({
      ...ticket,
      status: 'RESOLVED',
      resolvedAt,
    });
    conversationRepository.updateStatus.mockResolvedValue({
      id: 'conversation-1',
      customerId: 'customer-1',
      status: 'RESOLVED',
      resolvedAt,
    });

    const result = await TicketService.updateStatus('ticket-1', 'RESOLVED', 'actor-1');

    expect(result.status).toBe('RESOLVED');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(ticketRepository.setResolvedAt).toHaveBeenCalledWith(
      'ticket-1',
      expect.any(Date),
      transactionClient,
    );
    expect(conversationRepository.updateStatus).toHaveBeenCalledWith(
      'conversation-1',
      'RESOLVED',
      expect.any(Date),
      transactionClient,
    );
    expect(notificationService.create).toHaveBeenCalledWith(
      'customer-1',
      'TICKET_RESOLVED',
      expect.objectContaining({ type: 'TICKET_RESOLVED' }),
    );
  });

  it('updates agent availability', async () => {
    const availability = { id: 'availability-1', agentId: 'agent-1', status: 'AVAILABLE' };
    ticketRepository.setAvailability.mockResolvedValue(availability);

    const result = await TicketService.setAgentAvailability('agent-1', 'AVAILABLE');

    expect(result).toEqual(availability);
    expect(ticketRepository.setAvailability).toHaveBeenCalledWith('agent-1', 'AVAILABLE');
  });
});
