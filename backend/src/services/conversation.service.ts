import { ConversationRepository } from '../repositories/ConversationRepository.js';
import type { Conversation } from '../generated/prisma/client.js';
import { AppError } from '../utils/AppError.js';
import type { Message } from '../generated/prisma/client.js';
import { generateReply } from './ai.service.js';

export interface ConversationMessageResult {
  customerMessage: Message;
  assistantMessage: Message;
}

export const ConversationService = {
  async listForCustomer(customerId: string): Promise<Conversation[]> {
    return ConversationRepository.findByCustomerId(customerId);
  },

  async createForCustomer(customerId: string): Promise<Conversation> {
    return ConversationRepository.create(customerId);
  },

  async addCustomerMessage(
    conversationId: string,
    customerId: string,
    content: string,
  ): Promise<ConversationMessageResult> {
    const conversation = await ConversationRepository.findByIdForCustomer(
      conversationId,
      customerId,
    );
    if (!conversation) {
      throw new AppError('Conversation not found', 404);
    }

    const customerMessage = await ConversationRepository.createCustomerMessage(
      conversationId,
      customerId,
      content,
    );
    const aiReply = await generateReply(conversationId, content);
    const assistantMessage = await ConversationRepository.createAiMessage(
      conversationId,
      aiReply.content,
      aiReply,
    );

    return { customerMessage, assistantMessage };
  },
};