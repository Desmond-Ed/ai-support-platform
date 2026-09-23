import { prisma } from '../config/db.js';
import type { AgentAvailability, Prisma, Ticket, TicketAssignment } from '../generated/prisma/client.js';

type Db = Prisma.TransactionClient | typeof prisma;

export const TicketRepository = {
  async findByCustomerId(customerId: string, db: Db = prisma): Promise<Ticket[]> {
    return db.ticket.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
    });
  },

  async findByAgentId(agentId: string, db: Db = prisma): Promise<Ticket[]> {
    return db.ticket.findMany({
      where: { assignments: { some: { agentId, unassignedAt: null } } },
      orderBy: { updatedAt: 'desc' },
    });
  },

  async findById(ticketId: string, db: Db = prisma): Promise<Ticket | null> {
    return db.ticket.findUnique({ where: { id: ticketId } });
  },

  async updateStatus(
    ticketId: string,
    status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED',
    db: Db = prisma,
  ): Promise<Ticket> {
    return db.ticket.update({
      where: { id: ticketId },
      data: { status },
    });
  },

  async create(
    data: {
      conversationId: string;
      customerId: string;
      subject: string;
      description?: string | null;
      priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
      status?: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
    },
    db: Db = prisma,
  ): Promise<Ticket> {
    return db.ticket.create({
      data: {
        conversationId: data.conversationId,
        customerId: data.customerId,
        subject: data.subject,
        description: data.description ?? null,
        priority: data.priority ?? 'MEDIUM',
        status: data.status ?? 'OPEN',
      },
    });
  },

  async assignAgent(
    ticketId: string,
    agentId: string,
    db: Db = prisma,
  ): Promise<TicketAssignment> {
    return db.ticketAssignment.create({
      data: {
        ticketId,
        agentId,
      },
    });
  },

  async setAvailability(
    agentId: string,
    status: 'AVAILABLE' | 'BUSY' | 'OFFLINE',
    db: Db = prisma,
  ): Promise<AgentAvailability> {
    return db.agentAvailability.upsert({
      where: { agentId },
      update: { status },
      create: { agentId, status },
    });
  },
};
