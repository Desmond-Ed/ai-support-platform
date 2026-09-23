import type { Request, Response } from 'express';
import { KnowledgeService } from '../services/knowledge.service.js';
import { AppError } from '../utils/AppError.js';

function userId(req: Request): string {
  if (!req.user) {
    throw new AppError('Not authenticated', 401);
  }
  return req.user.id;
}

export const KnowledgeController = {
  async list(req: Request, res: Response): Promise<void> {
    const documents = await KnowledgeService.listForUser(userId(req));
    res.status(200).json({ documents });
  },

  async create(req: Request, res: Response): Promise<void> {
    const payload = req.body as { title?: string; content?: string; sourceType?: string };
    const document = await KnowledgeService.createDocument({
      title: payload.title ?? '',
      content: payload.content ?? '',
      sourceType: payload.sourceType ?? 'MANUAL',
      uploadedById: userId(req),
    });
    res.status(201).json({ document });
  },
};
