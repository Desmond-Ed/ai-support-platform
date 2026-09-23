import { Router } from 'express';
import { KnowledgeController } from '../controllers/knowledge.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { validateBody } from '../middleware/validate.js';
import { createKnowledgeDocumentSchema } from '../validators/knowledge.validators.js';

export const knowledgeRouter = Router();

knowledgeRouter.use(authenticate);
knowledgeRouter.get('/', KnowledgeController.list);
knowledgeRouter.post('/', validateBody(createKnowledgeDocumentSchema), KnowledgeController.create);
