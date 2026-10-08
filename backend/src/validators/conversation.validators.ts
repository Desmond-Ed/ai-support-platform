import { z } from 'zod';

export const createMessageSchema = z.object({
  content: z.string().trim().min(1, 'Message cannot be empty').max(10_000),
});

export const createAgentMessageSchema = z.object({
  content: z.string().trim().min(1, 'Message cannot be empty').max(10_000),
});

export type CreateMessageInput = z.infer<typeof createMessageSchema>;
export type CreateAgentMessageInput = z.infer<typeof createAgentMessageSchema>;