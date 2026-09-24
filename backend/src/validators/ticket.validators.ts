import { z } from 'zod';

export const agentAvailabilitySchema = z.object({
  status: z.enum(['AVAILABLE', 'BUSY', 'OFFLINE']),
});

export type AgentAvailabilityInput = z.infer<typeof agentAvailabilitySchema>;