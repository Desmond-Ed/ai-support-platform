import { prisma } from '../config/db.js';
import { AppError } from '../utils/AppError.js';
import { ConversationRepository } from '../repositories/ConversationRepository.js';
import { TicketRepository } from '../repositories/TicketRepository.js';
import { UserRepository } from '../repositories/UserRepository.js';
import { NotificationService } from './notification.service.js';
import { AuditService } from './audit.service.js';
import type { AgentAvailability, Ticket, TicketAssignment } from '../generated/prisma/client.js';

export interface CreateTicketInput {
  subject: string;
  description?: string | null;
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
}

export const TicketService = {
  async listForCustomer(customerId: string): Promise<Ticket[]> {
    return TicketRepository.findByCustomerId(customerId);
  },

  async listForAgent(agentId: string): Promise<Ticket[]> {
    return TicketRepository.findByAgentId(agentId);
  },

  async createForCustomer(
    customerId: string,
    conversationId: string,
    input: CreateTicketInput,
  ): Promise<Ticket> {
    const conversation = await ConversationRepository.findByIdForCustomer(conversationId, customerId);
    if (!conversation) {
      throw new AppError('Conversation not found', 404);
    }

    const ticket = await TicketRepository.create({
      conversationId,
      customerId,
      subject: input.subject,
      description: input.description ?? null,
      priority: input.priority ?? 'MEDIUM',
      status: 'OPEN',
    });

    await NotificationService.create(customerId, 'TICKET_CREATED', {
      type: 'TICKET_CREATED',
      message: `Ticket ${ticket.subject} was created`,
      resourceId: ticket.id,
    });
    return ticket;
  },

  async assignAgent(ticketId: string, agentId: string, actorId: string): Promise<TicketAssignment> {
    const ticket = await TicketRepository.findById(ticketId);
    if (!ticket) {
      throw new AppError('Ticket not found', 404);
    }

    const agent = await UserRepository.findById(agentId);
    if (!agent || !agent.isActive || (agent.role !== 'AGENT' && agent.role !== 'ADMIN')) {
      throw new AppError('Assigned user is not an active agent', 400);
    }

    const result = await prisma.$transaction(async (tx) => {
      await TicketRepository.lockById(ticketId, tx);
      const lockedTicket = await TicketRepository.findById(ticketId, tx);
      if (!lockedTicket) {
        throw new AppError('Ticket not found', 404);
      }

      const activeAssignment = await TicketRepository.findActiveAssignment(ticketId, tx);
      if (activeAssignment?.agentId === agentId) {
        return { assignment: activeAssignment, ticket: lockedTicket, changed: false };
      }

      await TicketRepository.unassignActive(ticketId, new Date(), tx);
      const assignment = await TicketRepository.createAssignment(ticketId, agentId, tx);
      await ConversationRepository.assignAgent(lockedTicket.conversationId, agentId, tx);
      await AuditService.record(
        {
          actorId,
          action: 'TICKET_ASSIGNED',
          entityType: 'Ticket',
          entityId: ticketId,
          metadata: {
            ticketId,
            conversationId: lockedTicket.conversationId,
            previousAgentId: activeAssignment?.agentId ?? null,
            newAgentId: agentId,
          },
        },
        tx,
      );

      return { assignment, ticket: lockedTicket, changed: true };
    });

    if (!result.changed) {
      return result.assignment;
    }

    await Promise.all([
      NotificationService.create(result.ticket.customerId, 'TICKET_STATUS_CHANGED', {
        type: 'TICKET_STATUS_CHANGED',
        message: 'An agent was assigned to your ticket',
        resourceId: ticketId,
      }),
      NotificationService.create(agentId, 'TICKET_STATUS_CHANGED', {
        type: 'TICKET_STATUS_CHANGED',
        message: 'A ticket was assigned to you',
        resourceId: ticketId,
      }),
    ]);
    return result.assignment;
  },

  async updateStatus(
    ticketId: string,
    status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED',
    actorId: string,
  ): Promise<Ticket> {
    const result = await prisma.$transaction(async (tx) => {
      await TicketRepository.lockById(ticketId, tx);
      const ticket = await TicketRepository.findById(ticketId, tx);
      if (!ticket) {
        throw new AppError('Ticket not found', 404);
      }

      if (ticket.status === status) {
        return { ticket, changed: false };
      }

      const now = new Date();
      let updated: Ticket;
      if (status === 'RESOLVED') {
        updated = await TicketRepository.setResolvedAt(ticketId, now, tx);
        await ConversationRepository.updateStatus(ticket.conversationId, 'RESOLVED', now, tx);
      } else {
        updated = await TicketRepository.updateStatus(ticketId, status, tx);
      }

      await AuditService.record(
        {
          actorId,
          action: 'TICKET_STATUS_CHANGED',
          entityType: 'Ticket',
          entityId: ticketId,
          metadata: {
            ticketId,
            conversationId: ticket.conversationId,
            previousStatus: ticket.status,
            newStatus: status,
            resolvedAt: updated.resolvedAt?.toISOString() ?? null,
          },
        },
        tx,
      );

      return { ticket: updated, changed: true };
    });

    if (!result.changed) {
      return result.ticket;
    }

    const notifications = [NotificationService.create(result.ticket.customerId, 'TICKET_STATUS_CHANGED', {
      type: 'TICKET_STATUS_CHANGED',
      message: `Ticket status changed to ${status}`,
      resourceId: ticketId,
    })];
    if (status === 'RESOLVED') {
      notifications.push(NotificationService.create(result.ticket.customerId, 'TICKET_RESOLVED', {
        type: 'TICKET_RESOLVED',
        message: 'Your ticket has been resolved.',
        resourceId: ticketId,
      }));
    }
    await Promise.all(notifications);
    return result.ticket;
  },

  async setAgentAvailability(
    agentId: string,
    status: 'AVAILABLE' | 'BUSY' | 'OFFLINE',
  ): Promise<AgentAvailability> {
    return TicketRepository.setAvailability(agentId, status);
  },
};
