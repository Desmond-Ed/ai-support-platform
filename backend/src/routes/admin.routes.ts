import { Router } from 'express';
import { AdminController } from '../controllers/admin.controller.js';
import { authenticate, requireRole } from '../middleware/auth.middleware.js';
import { validateBody } from '../middleware/validate.js';
import { updateAdminUserSchema } from '../validators/admin.validators.js';

export const adminRouter = Router();

adminRouter.use(authenticate, requireRole('ADMIN'));
adminRouter.get('/users', AdminController.listUsers);
adminRouter.patch('/users/:id', validateBody(updateAdminUserSchema), AdminController.updateUser);
adminRouter.get('/knowledge', AdminController.listKnowledge);