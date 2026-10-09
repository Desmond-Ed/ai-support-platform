import { prisma } from '../config/db.js';
import type {
  Conversation,
  ConversationStatus,
  Message,
  Prisma,
} from '../generated/prisma/client.js';

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

  async findById(conversationId: string, db: Db = prisma): Promise<Conversation | null> {
    return db.conversation.findUnique({ where: { id: conversationId } });
  },

  async findByIdForCustomer(
    conversationId: string,
    customerId: string,
    db: Db = prisma,
  ): Promise<Conversation | null> {
    return db.conversation.findFirst({ where: { id: conversationId, customerId } });
  },

  async listMessages(conversationId: string, db: Db = prisma): Promise<Message[]> {
    const messages = await db.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return messages.reverse();
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

  async createSystemMessage(conversationId: string, content: string, db: Db = prisma): Promise<Message> {
    return db.message.create({
      data: {
        conversationId,
        senderType: 'SYSTEM',
        content,
      },
    });
  },

  async createAgentMessage(
    conversationId: string,
    agentId: string,
    content: string,
    db: Db = prisma,
  ): Promise<Message> {
    return db.message.create({
      data: {
        conversationId,
        senderType: 'AGENT',
        senderId: agentId,
        content,
      },
    });
  },

  async updateStatus(
    conversationId: string,
    status: ConversationStatus,
    resolvedAt?: Date | null,
    db: Db = prisma,
  ): Promise<Conversation> {
    return db.conversation.update({
      where: { id: conversationId },
      data: {
        status,
        ...(typeof resolvedAt !== 'undefined' ? { resolvedAt } : {}),
      },
    });
  },
};