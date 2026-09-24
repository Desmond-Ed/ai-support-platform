import { z } from 'zod';

export const updateAdminUserSchema = z.object({
  role: z.enum(['CUSTOMER', 'AGENT', 'ADMIN']).optional(),
  isActive: z.boolean().optional(),
}).refine((value) => value.role !== undefined || value.isActive !== undefined, {
  message: 'role or isActive is required',
});