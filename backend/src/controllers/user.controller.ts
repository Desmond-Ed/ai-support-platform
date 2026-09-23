import type { Request, Response } from 'express';
import { AppError } from '../utils/AppError.js';
import { UserService } from '../services/user.service.js';
import type { UpdateProfileInput } from '../validators/user.validators.js';

export const UserController = {
  async getMe(req: Request, res: Response): Promise<void> {
    if (!req.user) {
      throw new AppError('Not authenticated', 401);
    }

    const user = await UserService.getById(req.user.id);
    res.status(200).json({ user });
  },

  async updateMe(req: Request, res: Response): Promise<void> {
    if (!req.user) {
      throw new AppError('Not authenticated', 401);
    }

    const user = await UserService.updateProfile(req.user.id, req.body as UpdateProfileInput);
    res.status(200).json({ user });
  },
};