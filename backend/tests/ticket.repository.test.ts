import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  ticketAssignment: {
    findFirst: vi.fn(),
    create: vi.fn(),
    updateMany: vi.fn(),
  },
  ticket: {
    update: vi.fn(),
  },
}));

vi.mock('../src/config/db.js', () => ({ prisma: db }));

import { TicketRepository } from '../src/repositories/TicketRepository.js';

beforeEach(() => {
  vi.resetAllMocks();
  db.ticketAssignment.findFirst.mockResolvedValue({
    id: 'assignment-1',
    ticketId: 'ticket-1',
    agentId: 'agent-1',
  });
  db.ticketAssignment.create.mockResolvedValue({
    id: 'assignment-1',
    ticketId: 'ticket-1',
    agentId: 'agent-1',
  });
  db.ticketAssignment.updateMany.mockResolvedValue({ count: 1 });
  db.ticket.update.mockResolvedValue({ id: 'ticket-1', status: 'IN_PROGRESS', resolvedAt: null });
});

describe('TicketRepository', () => {
  it('finds the active assignment for a ticket', async () => {
    const result = await TicketRepository.findActiveAssignment('ticket-1');

    expect(result).toMatchObject({ ticketId: 'ticket-1', agentId: 'agent-1' });
    expect(db.ticketAssignment.findFirst).toHaveBeenCalledWith({
      where: { ticketId: 'ticket-1', unassignedAt: null },
      orderBy: { assignedAt: 'desc' },
    });
  });

  it('closes the active assignment and creates the replacement', async () => {
    const unassignedAt = new Date();
    const unassigned = await TicketRepository.unassignActive('ticket-1', unassignedAt);
    const result = await TicketRepository.createAssignment('ticket-1', 'agent-1');

    expect(unassigned).toBe(1);
    expect(db.ticketAssignment.updateMany).toHaveBeenCalledWith({
      where: { ticketId: 'ticket-1', unassignedAt: null },
      data: { unassignedAt },
    });
    expect(result).toMatchObject({ ticketId: 'ticket-1', agentId: 'agent-1' });
    expect(db.ticketAssignment.create).toHaveBeenCalledWith({
      data: { ticketId: 'ticket-1', agentId: 'agent-1' },
    });
  });

  it('clears resolvedAt only when a ticket is reopened', async () => {
    await TicketRepository.updateStatus('ticket-1', 'IN_PROGRESS');

    expect(db.ticket.update).toHaveBeenCalledWith({
      where: { id: 'ticket-1' },
      data: { status: 'IN_PROGRESS', resolvedAt: null },
    });
  });

  it('does not clear resolvedAt when moving a resolved ticket to closed', async () => {
    await TicketRepository.updateStatus('ticket-1', 'CLOSED');

    expect(db.ticket.update).toHaveBeenCalledWith({
      where: { id: 'ticket-1' },
      data: { status: 'CLOSED' },
    });
  });
});
