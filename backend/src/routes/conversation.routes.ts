import { Router } from 'express';
import { ConversationController } from '../controllers/conversation.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { validateBody } from '../middleware/validate.js';
import { createMessageSchema } from '../validators/conversation.validators.js';

export const conversationRouter = Router();

conversationRouter.use(authenticate);
conversationRouter.get('/', ConversationController.list);
conversationRouter.post('/', ConversationController.create);
conversationRouter.post('/:id/messages', validateBody(createMessageSchema), ConversationController.addMessage);