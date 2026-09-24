import { AppError } from '../utils/AppError.js';
import { ConversationRepository } from '../repositories/ConversationRepository.js';
import { TicketRepository } from '../repositories/TicketRepository.js';
import { NotificationService } from './notification.service.js';
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

  async assignAgent(ticketId: string, agentId: string): Promise<TicketAssignment> {
    const ticket = await TicketRepository.findById(ticketId);
    if (!ticket) {
      throw new AppError('Ticket not found', 404);
    }

    const assignment = await TicketRepository.assignAgent(ticketId, agentId);
    await Promise.all([
      NotificationService.create(ticket.customerId, 'TICKET_STATUS_CHANGED', {
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
    return assignment;
  },

  async updateStatus(
    ticketId: string,
    status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED',
  ): Promise<Ticket> {
    const ticket = await TicketRepository.findById(ticketId);
    if (!ticket) {
      throw new AppError('Ticket not found', 404);
    }

    const updatedTicket = await TicketRepository.updateStatus(ticketId, status);
    await NotificationService.create(ticket.customerId, 'TICKET_STATUS_CHANGED', {
      type: 'TICKET_STATUS_CHANGED',
      message: `Ticket status changed to ${status}`,
      resourceId: ticketId,
    });
    return updatedTicket;
  },

  async setAgentAvailability(
    agentId: string,
    status: 'AVAILABLE' | 'BUSY' | 'OFFLINE',
  ): Promise<AgentAvailability> {
    return TicketRepository.setAvailability(agentId, status);
  },
};
