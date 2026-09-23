import { AppError } from '../utils/AppError.js';
import { ConversationRepository } from '../repositories/ConversationRepository.js';
import { TicketRepository } from '../repositories/TicketRepository.js';
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

    return TicketRepository.create({
      conversationId,
      customerId,
      subject: input.subject,
      description: input.description ?? null,
      priority: input.priority ?? 'MEDIUM',
      status: 'OPEN',
    });
  },

  async assignAgent(ticketId: string, agentId: string): Promise<TicketAssignment> {
    const ticket = await TicketRepository.findById(ticketId);
    if (!ticket) {
      throw new AppError('Ticket not found', 404);
    }

    return TicketRepository.assignAgent(ticketId, agentId);
  },

  async updateStatus(
    ticketId: string,
    status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED',
  ): Promise<Ticket> {
    const ticket = await TicketRepository.findById(ticketId);
    if (!ticket) {
      throw new AppError('Ticket not found', 404);
    }

    return TicketRepository.updateStatus(ticketId, status);
  },

  async setAgentAvailability(
    agentId: string,
    status: 'AVAILABLE' | 'BUSY' | 'OFFLINE',
  ): Promise<AgentAvailability> {
    return TicketRepository.setAvailability(agentId, status);
  },
};
