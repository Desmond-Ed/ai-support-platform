import { Router } from 'express';
import { ConversationController } from '../controllers/conversation.controller.js';
import { authenticate, requireRole } from '../middleware/auth.middleware.js';
import { validateBody } from '../middleware/validate.js';
import { createAgentMessageSchema, createMessageSchema } from '../validators/conversation.validators.js';

export const conversationRouter = Router();

conversationRouter.use(authenticate);
conversationRouter.get('/', ConversationController.list);
conversationRouter.get('/:id/messages', ConversationController.listMessages);
conversationRouter.post('/', ConversationController.create);
conversationRouter.post('/:id/messages', validateBody(createMessageSchema), ConversationController.addMessage);
conversationRouter.post(
  '/:id/agent-messages',
  requireRole('AGENT', 'ADMIN'),
  validateBody(createAgentMessageSchema),
  ConversationController.addAgentMessage,
);