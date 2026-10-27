import type { Request, Response } from 'express';
import { AdminService } from '../services/admin.service.js';
import { KnowledgeModerationService } from '../services/knowledgeModeration.service.js';
import { AppError } from '../utils/AppError.js';
import type { AuditLogQuery } from '../validators/audit.validators.js';
import type { AdminKnowledgeQuery } from '../validators/knowledgeAdmin.validators.js';
import type {
  ModerateKnowledgeInput,
  RetryKnowledgeIngestionInput,
} from '../validators/knowledgeAdmin.validators.js';

function actorId(req: Request): string {
  if (!req.user) throw new AppError('Not authenticated', 401);
  return req.user.id;
}

function documentId(req: Request): string {
  if (typeof req.params.id !== 'string') throw new AppError('Knowledge document not found', 404);
  return req.params.id;
}

export const AdminController = {
  async listUsers(_req: Request, res: Response): Promise<void> {
    res.status(200).json({ users: await AdminService.listUsers() });
  },

  async listKnowledge(req: Request, res: Response): Promise<void> {
    const query = req.query as unknown as AdminKnowledgeQuery;
    res.status(200).json(await AdminService.listKnowledgeDocuments(query));
  },

  async getKnowledge(req: Request, res: Response): Promise<void> {
    res.status(200).json({ document: await KnowledgeModerationService.detail(documentId(req)) });
  },

  async moderateKnowledge(req: Request, res: Response): Promise<void> {
    const document = await KnowledgeModerationService.moderate(
      documentId(req),
      req.body as ModerateKnowledgeInput,
      actorId(req),
    );
    res.status(200).json({ document });
  },

  async retryKnowledgeIngestion(req: Request, res: Response): Promise<void> {
    const payload = req.body as RetryKnowledgeIngestionInput;
    const result = await KnowledgeModerationService.retryIngestion(
      documentId(req),
      actorId(req),
      payload.expectedVersion,
    );
    res.status(202).json(result);
  },

  async listAuditLogs(req: Request, res: Response): Promise<void> {
    const query = req.query as unknown as AuditLogQuery;
    res.status(200).json(await AdminService.listAuditLogs(query));
  },

  async updateUser(req: Request, res: Response): Promise<void> {
    if (typeof req.params.id !== 'string') throw new AppError('User not found', 404);
    const payload = req.body as { role?: 'CUSTOMER' | 'AGENT' | 'ADMIN'; isActive?: boolean };
    const user = await AdminService.updateUser(req.params.id, payload, actorId(req));
    res.status(200).json({ user });
  },
};
