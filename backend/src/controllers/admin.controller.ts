import type { Request, Response } from 'express';
import { AdminService } from '../services/admin.service.js';
import { AppError } from '../utils/AppError.js';

export const AdminController = {
  async listUsers(_req: Request, res: Response): Promise<void> {
    res.status(200).json({ users: await AdminService.listUsers() });
  },

  async listKnowledge(_req: Request, res: Response): Promise<void> {
    res.status(200).json({ documents: await AdminService.listKnowledgeDocuments() });
  },

  async updateUser(req: Request, res: Response): Promise<void> {
    if (typeof req.params.id !== 'string') throw new AppError('User not found', 404);
    const payload = req.body as { role?: 'CUSTOMER' | 'AGENT' | 'ADMIN'; isActive?: boolean };
    const user = await AdminService.updateUser(req.params.id, payload);
    res.status(200).json({ user });
  },
};