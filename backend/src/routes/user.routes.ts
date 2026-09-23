import { Router } from 'express';
import { UserController } from '../controllers/user.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { validateBody } from '../middleware/validate.js';
import { updateProfileSchema } from '../validators/user.validators.js';

export const userRouter = Router();

userRouter.get('/me', authenticate, UserController.getMe);
userRouter.patch('/me', authenticate, validateBody(updateProfileSchema), UserController.updateMe);