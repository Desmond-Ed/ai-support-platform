import { prisma } from '../config/db.js';
import type { Conversation, Message, Prisma } from '../generated/prisma/client.js';

type Db = Prisma.TransactionClient | typeof prisma;

export const ConversationRepository = {
  async findByCustomerId(customerId: string, db: Db = prisma): Promise<Conversation[]> {
    return db.conversation.findMany({
      where: { customerId },
      orderBy: { updatedAt: 'desc' },
    });
  },

  async create(customerId: string, db: Db = prisma): Promise<Conversation> {
    return db.conversation.create({ data: { customerId } });
  },

  async findByIdForCustomer(
    conversationId: string,
    customerId: string,
    db: Db = prisma,
  ): Promise<Conversation | null> {
    return db.conversation.findFirst({ where: { id: conversationId, customerId } });
  },

  async createCustomerMessage(
    conversationId: string,
    customerId: string,
    content: string,
    db: Db = prisma,
  ): Promise<Message> {
    return db.message.create({
      data: {
        conversationId,
        senderType: 'CUSTOMER',
        senderId: customerId,
        content,
      },
    });
  },

  async createAiMessage(
    conversationId: string,
    content: string,
    metadata: {
      confidence: number | null;
      grounded: boolean | null;
      shouldEscalate: boolean;
    },
    db: Db = prisma,
  ): Promise<Message> {
    return db.message.create({
      data: {
        conversationId,
        senderType: 'AI',
        content,
        confidence: metadata.confidence,
        grounded: metadata.grounded,
        shouldEscalate: metadata.shouldEscalate,
      },
    });
  },
};