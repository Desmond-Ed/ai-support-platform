import type { Request, Response } from 'express';
import { AppError } from '../utils/AppError.js';
import { ConversationService } from '../services/conversation.service.js';
import type { CreateMessageInput } from '../validators/conversation.validators.js';

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
};