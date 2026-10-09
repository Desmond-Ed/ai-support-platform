import { prisma } from '../config/db.js';
import { ConversationRepository } from '../repositories/ConversationRepository.js';
import type { Conversation, Message, Role } from '../generated/prisma/client.js';
import { AppError } from '../utils/AppError.js';
import { generateReply } from './ai.service.js';
import { NotificationService } from './notification.service.js';
import type { RealtimeEvents } from '../sockets/index.js';

type ConversationMessagePayload = RealtimeEvents['conversation_message'];
type ConversationMessageEmitter = (conversationId: string, payload: ConversationMessagePayload) => void;

let emitConversationMessage: ConversationMessageEmitter | undefined;

export interface ConversationMessageResult {
  customerMessage: Message;
  assistantMessage: Message;
  degraded?: boolean;
}

async function ensureEscalation(
  conversationId: string,
  customerId: string,
  fallbackMessage: string,
): Promise<void> {
  const ticket = await prisma.$transaction(async (tx) => {
    const claim = await tx.conversation.updateMany({
      where: { id: conversationId, status: 'AI_HANDLING' },
      data: { status: 'ESCALATED' },
    });
    if (claim.count !== 1) {
      return null;
    }

    return tx.ticket.create({
      data: {
        conversationId,
        customerId,
        subject: `Conversation #${conversationId.slice(0, 8)}`,
        description: fallbackMessage,
        priority: 'MEDIUM',
        status: 'OPEN',
      },
    });
  });
  if (!ticket) {
    return;
  }

  const escalationMessage = {
    type: 'AI_HANDOFF' as const,
    message: 'A support agent will follow up shortly.',
    resourceId: ticket.id,
  };

  await NotificationService.create(customerId, 'TICKET_CREATED', {
    type: 'TICKET_CREATED',
    message: `Ticket ${ticket.subject} was created`,
    resourceId: ticket.id,
  });
  await NotificationService.create(customerId, 'AI_HANDOFF', escalationMessage);

  const agentUsers = await prisma.user.findMany({
    where: { role: 'AGENT', isActive: true },
    select: { id: true },
  });

  await Promise.all(
    agentUsers.map(({ id }) =>
      NotificationService.create(id, 'AI_HANDOFF', {
        ...escalationMessage,
        message: `New handoff for conversation ${conversationId}`,
      }),
    ),
  );
}

export const ConversationService = {
  setEmitter(emitter: ConversationMessageEmitter): void {
    emitConversationMessage = emitter;
  },

  async listForCustomer(customerId: string): Promise<Conversation[]> {
    return ConversationRepository.findByCustomerId(customerId);
  },

  async createForCustomer(customerId: string): Promise<Conversation> {
    return ConversationRepository.create(customerId);
  },

  async listMessages(conversationId: string, requesterId: string, requesterRole: Role): Promise<Message[]> {
    const conversation = requesterRole === 'CUSTOMER'
      ? await ConversationRepository.findByIdForCustomer(conversationId, requesterId)
      : await ConversationRepository.findById(conversationId);
    if (!conversation) {
      throw new AppError('Conversation not found', 404);
    }
    if (requesterRole === 'AGENT' && conversation.agentId !== requesterId) {
      throw new AppError('Agent is not assigned to this conversation', 403);
    }

    return ConversationRepository.listMessages(conversationId);
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
    emitConversationMessage?.(conversationId, {
      messageId: customerMessage.id,
      conversationId,
      senderType: 'CUSTOMER',
      senderId: customerId,
      content: customerMessage.content,
      createdAt: customerMessage.createdAt.toISOString(),
    });

    try {
      const aiReply = await generateReply(conversationId, content);
      const assistantMessage = await ConversationRepository.createAiMessage(
        conversationId,
        aiReply.content,
        aiReply,
      );
      emitConversationMessage?.(conversationId, {
        messageId: assistantMessage.id,
        conversationId,
        senderType: 'AI',
        senderId: 'ai-service',
        content: assistantMessage.content,
        createdAt: assistantMessage.createdAt.toISOString(),
      });

      if (aiReply.shouldEscalate) {
        await ensureEscalation(conversationId, customerId, aiReply.content);
      }

      return { customerMessage, assistantMessage };
    } catch (error) {
      const isDegradedServiceError =
        (error instanceof AppError && error.statusCode === 503) ||
        (typeof error === 'object' &&
          error !== null &&
          'statusCode' in error &&
          typeof error.statusCode === 'number' &&
          error.statusCode === 503);

      if (isDegradedServiceError) {
        const degradedMessage = await ConversationRepository.createSystemMessage(
          conversationId,
          'The AI support service is temporarily unavailable. A human agent has been notified and will follow up shortly.',
        );
        emitConversationMessage?.(conversationId, {
          messageId: degradedMessage.id,
          conversationId,
          senderType: 'SYSTEM',
          senderId: 'system',
          content: degradedMessage.content,
          createdAt: degradedMessage.createdAt.toISOString(),
        });
        await ensureEscalation(
          conversationId,
          customerId,
          'AI service unavailable; degraded fallback triggered',
        );
        return { customerMessage, assistantMessage: degradedMessage, degraded: true };
      }

      throw error;
    }
  },

  async addAgentMessage(
    conversationId: string,
    payload: { content: string },
    actingUserId: string,
    actingUserRole: Role,
  ): Promise<{ message: Message }> {
    const conversation = await ConversationRepository.findById(conversationId);
    if (!conversation) {
      throw new AppError('Conversation not found', 404);
    }

    if (actingUserRole !== 'ADMIN' && conversation.agentId !== actingUserId) {
      throw new AppError('Agent is not assigned to this conversation', 403);
    }
    if (conversation.status === 'RESOLVED' || conversation.status === 'CLOSED') {
      throw new AppError('Cannot reply to a resolved or closed conversation', 409);
    }

    const message = await ConversationRepository.createAgentMessage(
      conversationId,
      actingUserId,
      payload.content,
    );
    emitConversationMessage?.(conversationId, {
      messageId: message.id,
      conversationId,
      senderType: 'AGENT',
      senderId: actingUserId,
      content: message.content,
      createdAt: message.createdAt.toISOString(),
    });

    if (conversation.status !== 'WITH_AGENT') {
      await ConversationRepository.updateStatus(conversationId, 'WITH_AGENT');
    }

    await NotificationService.create(conversation.customerId, 'AGENT_REPLIED', {
      type: 'AGENT_REPLIED',
      message: 'An agent has replied to your conversation.',
      resourceId: conversationId,
    });

    return { message };
  },
};