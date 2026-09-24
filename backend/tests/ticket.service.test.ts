import { beforeEach, describe, expect, it, vi } from 'vitest';

const ticketRepository = vi.hoisted(() => ({
  findByCustomerId: vi.fn(),
  findByAgentId: vi.fn(),
  findById: vi.fn(),
  create: vi.fn(),
  assignAgent: vi.fn(),
  updateStatus: vi.fn(),
  setAvailability: vi.fn(),
}));

const conversationRepository = vi.hoisted(() => ({
  findByIdForCustomer: vi.fn(),
}));

const notificationService = vi.hoisted(() => ({
  create: vi.fn(),
}));

vi.mock('../src/repositories/TicketRepository.js', () => ({
  TicketRepository: ticketRepository,
}));

vi.mock('../src/repositories/ConversationRepository.js', () => ({
  ConversationRepository: conversationRepository,
}));

vi.mock('../src/services/notification.service.js', () => ({
  NotificationService: notificationService,
}));

import { TicketService } from '../src/services/ticket.service.js';

beforeEach(() => {
  vi.resetAllMocks();
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

  it('assigns an agent to a ticket', async () => {
    const ticket = { id: 'ticket-1', status: 'OPEN' };
    ticketRepository.findById.mockResolvedValue(ticket);
    ticketRepository.assignAgent.mockResolvedValue({ id: 'assignment-1', ticketId: 'ticket-1', agentId: 'agent-1' });

    const result = await TicketService.assignAgent('ticket-1', 'agent-1');

    expect(result).toEqual({ id: 'assignment-1', ticketId: 'ticket-1', agentId: 'agent-1' });
    expect(ticketRepository.assignAgent).toHaveBeenCalledWith('ticket-1', 'agent-1');
  });

  it('lists assigned tickets for an agent', async () => {
    const tickets = [{ id: 'ticket-1', customerId: 'customer-1', status: 'OPEN' }];
    ticketRepository.findByAgentId.mockResolvedValue(tickets);

    const result = await TicketService.listForAgent('agent-1');

    expect(result).toBe(tickets);
    expect(ticketRepository.findByAgentId).toHaveBeenCalledWith('agent-1');
  });

  it('updates the ticket status', async () => {
    const ticket = { id: 'ticket-1', status: 'IN_PROGRESS' };
    ticketRepository.findById.mockResolvedValue(ticket);
    ticketRepository.updateStatus.mockResolvedValue(ticket);

    const result = await TicketService.updateStatus('ticket-1', 'IN_PROGRESS');

    expect(result).toEqual(ticket);
    expect(ticketRepository.updateStatus).toHaveBeenCalledWith('ticket-1', 'IN_PROGRESS');
  });

  it('updates agent availability', async () => {
    const availability = { id: 'availability-1', agentId: 'agent-1', status: 'AVAILABLE' };
    ticketRepository.setAvailability.mockResolvedValue(availability);

    const result = await TicketService.setAgentAvailability('agent-1', 'AVAILABLE');

    expect(result).toEqual(availability);
    expect(ticketRepository.setAvailability).toHaveBeenCalledWith('agent-1', 'AVAILABLE');
  });
});
