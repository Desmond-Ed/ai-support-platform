import { z } from 'zod';

export const createKnowledgeDocumentSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200),
  sourceType: z.enum(['UPLOAD', 'URL', 'MANUAL']),
  uploadedById: z.string().uuid('Uploaded by id must be a valid UUID'),
});

export type CreateKnowledgeDocumentInput = z.infer<typeof createKnowledgeDocumentSchema>;
