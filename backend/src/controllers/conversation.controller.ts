import type { Request, Response } from 'express';
import { AppError } from '../utils/AppError.js';
import { ConversationService } from '../services/conversation.service.js';
import type {
  CreateAgentMessageInput,
  CreateMessageInput,
} from '../validators/conversation.validators.js';

function customerId(req: Request): string {
  if (!req.user) {
    throw new AppError('Not authenticated', 401);
  }
  return req.user.id;
}

export const ConversationController = {
  async list(req: Request, res: Response): Promise<void> {
    const conversations = await ConversationService.listForCustomer(customerId(req));
    res.status(200).json({ conversations });
  },

  async create(req: Request, res: Response): Promise<void> {
    const conversation = await ConversationService.createForCustomer(customerId(req));
    res.status(201).json({ conversation });
  },

  async handoff(req: Request, res: Response): Promise<void> {
    if (!req.user) {
      throw new AppError('Not authenticated', 401);
    }
    if (typeof req.params.id !== 'string') {
      throw new AppError('Conversation not found', 404);
    }

    const conversation = await ConversationService.handoffForCustomer(
      req.params.id,
      req.user.id,
      req.user.role,
    );
    res.status(200).json({ conversation });
  },

  async listMessages(req: Request, res: Response): Promise<void> {
    if (!req.user) {
      throw new AppError('Not authenticated', 401);
    }
    if (typeof req.params.id !== 'string') {
      throw new AppError('Conversation not found', 404);
    }

    const messages = await ConversationService.listMessages(
      req.params.id,
      req.user.id,
      req.user.role,
    );
    res.status(200).json({ messages });
  },

  async addMessage(req: Request, res: Response): Promise<void> {
    if (typeof req.params.id !== 'string') {
      throw new AppError('Conversation not found', 404);
    }

    const messages = await ConversationService.addCustomerMessage(
      req.params.id,
      customerId(req),
      (req.body as CreateMessageInput).content,
    );
    res.status(201).json(messages);
  },

  async addAgentMessage(req: Request, res: Response): Promise<void> {
    if (!req.user) {
      throw new AppError('Not authenticated', 401);
    }

    if (typeof req.params.id !== 'string') {
      throw new AppError('Conversation not found', 404);
    }

    const message = await ConversationService.addAgentMessage(
      req.params.id,
      req.body as CreateAgentMessageInput,
      req.user.id,
      req.user.role,
    );

    res.status(201).json({ message: message.message });
  },
};