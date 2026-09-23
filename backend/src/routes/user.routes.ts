import { Router } from 'express';
import { UserController } from '../controllers/user.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';

export const userRouter = Router();

userRouter.get('/me', authenticate, UserController.getMe);