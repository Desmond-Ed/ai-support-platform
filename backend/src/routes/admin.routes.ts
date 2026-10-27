import { Router } from 'express';
import { AdminController } from '../controllers/admin.controller.js';
import { authenticate, requireRole } from '../middleware/auth.middleware.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import { updateAdminUserSchema } from '../validators/admin.validators.js';
import { auditLogQuerySchema } from '../validators/audit.validators.js';
import {
  adminKnowledgeQuerySchema,
  moderateKnowledgeSchema,
  retryKnowledgeIngestionSchema,
} from '../validators/knowledgeAdmin.validators.js';

export const adminRouter = Router();

adminRouter.use(authenticate, requireRole('ADMIN'));
adminRouter.get('/users', AdminController.listUsers);
adminRouter.patch('/users/:id', validateBody(updateAdminUserSchema), AdminController.updateUser);
adminRouter.get('/knowledge', validateQuery(adminKnowledgeQuerySchema), AdminController.listKnowledge);
adminRouter.get('/knowledge/:id', AdminController.getKnowledge);
adminRouter.patch(
  '/knowledge/:id/moderation',
  validateBody(moderateKnowledgeSchema),
  AdminController.moderateKnowledge,
);
adminRouter.post(
  '/knowledge/:id/retry',
  validateBody(retryKnowledgeIngestionSchema),
  AdminController.retryKnowledgeIngestion,
);
adminRouter.get('/audit-logs', validateQuery(auditLogQuerySchema), AdminController.listAuditLogs);
