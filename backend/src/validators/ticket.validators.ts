import { z } from 'zod';

export const agentAvailabilitySchema = z.object({
  status: z.enum(['AVAILABLE', 'BUSY', 'OFFLINE']),
});

export const createTicketSchema = z.object({
  conversationId: z.string().min(1, 'conversationId is required'),
  subject: z.string().trim().min(1, 'Subject is required').max(200),
  description: z.string().trim().max(5_000).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
});

export const updateTicketStatusSchema = z.object({
  status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']),
});

export const assignTicketSchema = z.object({
  agentId: z.string().min(1, 'agentId is required'),
});

export type AgentAvailabilityInput = z.infer<typeof agentAvailabilitySchema>;
export type CreateTicketInput = z.infer<typeof createTicketSchema>;
export type UpdateTicketStatusInput = z.infer<typeof updateTicketStatusSchema>;
export type AssignTicketInput = z.infer<typeof assignTicketSchema>;
