import { beforeEach, describe, expect, it, vi } from 'vitest';

const transactionClient = vi.hoisted(() => ({
  ticketAssignment: { create: vi.fn() },
  conversation: {
    findUniqueOrThrow: vi.fn(),
    update: vi.fn(),
  },
}));

const prisma = vi.hoisted(() => ({ $transaction: vi.fn() }));

vi.mock('../src/config/db.js', () => ({ prisma }));

import { TicketRepository } from '../src/repositories/TicketRepository.js';

beforeEach(() => {
  vi.resetAllMocks();
  prisma.$transaction.mockImplementation((callback) => callback(transactionClient));
  transactionClient.ticketAssignment.create.mockResolvedValue({
    id: 'assignment-1',
    ticketId: 'ticket-1',
    agentId: 'agent-1',
  });
  transactionClient.conversation.findUniqueOrThrow.mockResolvedValue({ status: 'ESCALATED' });
});

describe('TicketRepository', () => {
  it('assigns a ticket and transitions its escalated conversation in one transaction', async () => {
    const result = await TicketRepository.assignAgent('ticket-1', 'agent-1', 'conversation-1');

    expect(result).toMatchObject({ ticketId: 'ticket-1', agentId: 'agent-1' });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(transactionClient.ticketAssignment.create).toHaveBeenCalledWith({
      data: { ticketId: 'ticket-1', agentId: 'agent-1' },
    });
    expect(transactionClient.conversation.update).toHaveBeenCalledWith({
      where: { id: 'conversation-1' },
      data: { agentId: 'agent-1', status: 'WITH_AGENT' },
    });
  });
});