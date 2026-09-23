import { z } from 'zod';

export const createKnowledgeDocumentSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200),
  content: z.string().trim().min(1, 'Document content is required').max(500_000),
  sourceType: z.enum(['UPLOAD', 'URL', 'MANUAL']),
});

export type CreateKnowledgeDocumentInput = z.infer<typeof createKnowledgeDocumentSchema>;
