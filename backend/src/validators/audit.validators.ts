import { z } from 'zod';
import { AUDIT_ACTIONS } from '../constants/audit.js';

export const auditLogQuerySchema = z.object({
  action: z.enum(AUDIT_ACTIONS).optional(),
  actorId: z.string().uuid().optional(),
  entityType: z.string().trim().min(1).max(50).optional(),
  entityId: z.string().uuid().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type AuditLogQuery = z.infer<typeof auditLogQuerySchema>;
