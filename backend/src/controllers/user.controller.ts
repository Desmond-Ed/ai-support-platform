import type { Request, Response } from 'express';
import { AppError } from '../utils/AppError.js';
import { UserService } from '../services/user.service.js';

export const UserController = {
  async getMe(req: Request, res: Response): Promise<void> {
    if (!req.user) {
      throw new AppError('Not authenticated', 401);
    }

    const user = await UserService.getById(req.user.id);
    res.status(200).json({ user });
  },
};