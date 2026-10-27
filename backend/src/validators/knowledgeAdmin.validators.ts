import { z } from 'zod';

export const adminKnowledgeQuerySchema = z.object({
  status: z.enum(['PENDING', 'PROCESSING', 'READY', 'FAILED']).optional(),
  moderationStatus: z
    .enum(['PENDING_REVIEW', 'APPROVED', 'REJECTED', 'ARCHIVED'])
    .optional(),
  search: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const moderateKnowledgeSchema = z.object({
  action: z.enum(['APPROVE', 'REJECT', 'ARCHIVE', 'RESTORE']),
  expectedVersion: z.number().int().min(0),
  reason: z.string().trim().max(500).optional(),
});

export const retryKnowledgeIngestionSchema = z.object({
  expectedVersion: z.number().int().min(0).optional(),
});

export type AdminKnowledgeQuery = z.infer<typeof adminKnowledgeQuerySchema>;
export type ModerateKnowledgeInput = z.infer<typeof moderateKnowledgeSchema>;
export type RetryKnowledgeIngestionInput = z.infer<typeof retryKnowledgeIngestionSchema>;
