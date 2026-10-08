import { beforeEach, describe, expect, it, vi } from 'vitest';

const prisma = vi.hoisted(() => ({
  user: { findMany: vi.fn() },
}));

const conversationRepository = vi.hoisted(() => ({
  findByCustomerId: vi.fn(),
  create: vi.fn(),
  findById: vi.fn(),
  findByIdForCustomer: vi.fn(),
  createCustomerMessage: vi.fn(),
  createAiMessage: vi.fn(),
  createSystemMessage: vi.fn(),
  createAgentMessage: vi.fn(),
  updateStatus: vi.fn(),
}));

const ticketService = vi.hoisted(() => ({
  createForCustomer: vi.fn(),
}));

const notificationService = vi.hoisted(() => ({
  create: vi.fn(),
}));

const generateReply = vi.hoisted(() => vi.fn());

vi.mock('../src/config/db.js', () => ({ prisma }));
vi.mock('../src/repositories/ConversationRepository.js', () => ({
  ConversationRepository: conversationRepository,
}));
vi.mock('../src/services/ai.service.js', () => ({ generateReply }));
vi.mock('../src/services/ticket.service.js', () => ({
  TicketService: ticketService,
}));
vi.mock('../src/services/notification.service.js', () => ({
  NotificationService: notificationService,
}));

import { ConversationService } from '../src/services/conversation.service.js';

beforeEach(() => {
  vi.resetAllMocks();
  prisma.user.findMany.mockResolvedValue([{ id: 'agent-1' }]);
});

describe('ConversationService', () => {
  it('lists conversations using the authenticated customer id', async () => {
    const conversations = [{ id: 'conversation-1', customerId: 'customer-1' }];
    conversationRepository.findByCustomerId.mockResolvedValue(conversations);

    const result = await ConversationService.listForCustomer('customer-1');

    expect(result).toBe(conversations);
    expect(conversationRepository.findByCustomerId).toHaveBeenCalledWith('customer-1');
  });

  it('creates a conversation for the authenticated customer', async () => {
    const conversation = { id: 'conversation-1', customerId: 'customer-1' };
    conversationRepository.create.mockResolvedValue(conversation);

    const result = await ConversationService.createForCustomer('customer-1');

    expect(result).toBe(conversation);
    expect(conversationRepository.create).toHaveBeenCalledWith('customer-1');
  });

  it('creates a customer message only for an owned conversation', async () => {
    const message = { id: 'message-1', conversationId: 'conversation-1', senderType: 'CUSTOMER' };
    const assistantMessage = { id: 'message-2', conversationId: 'conversation-1', senderType: 'AI' };
    conversationRepository.findByIdForCustomer.mockResolvedValue({
      id: 'conversation-1',
      customerId: 'customer-1',
    });
    conversationRepository.createCustomerMessage.mockResolvedValue(message);
    generateReply.mockResolvedValue({
      content: 'Here is a helpful answer.',
      confidence: null,
      grounded: null,
      shouldEscalate: false,
    });
    conversationRepository.createAiMessage.mockResolvedValue(assistantMessage);

    const result = await ConversationService.addCustomerMessage(
      'conversation-1',
      'customer-1',
      'I need help',
    );

    expect(result).toEqual({ customerMessage: message, assistantMessage });
    expect(conversationRepository.createCustomerMessage).toHaveBeenCalledWith(
      'conversation-1',
      'customer-1',
      'I need help',
    );
    expect(generateReply).toHaveBeenCalledWith('conversation-1', 'I need help');
    expect(conversationRepository.createAiMessage).toHaveBeenCalledWith(
      'conversation-1',
      'Here is a helpful answer.',
      expect.objectContaining({ shouldEscalate: false }),
    );
  });

  it('rejects a message for a conversation the customer does not own', async () => {
    conversationRepository.findByIdForCustomer.mockResolvedValue(null);

    await expect(
      ConversationService.addCustomerMessage('conversation-1', 'customer-1', 'I need help'),
    ).rejects.toMatchObject({ statusCode: 404, message: 'Conversation not found' });
    expect(conversationRepository.createCustomerMessage).not.toHaveBeenCalled();
  });

  it('escalates to a human when the AI marks the reply as escalated', async () => {
    const customerMessage = { id: 'message-1', conversationId: 'conversation-1', senderType: 'CUSTOMER' };
    const assistantMessage = { id: 'message-2', conversationId: 'conversation-1', senderType: 'AI' };
    const handoffMessage = { id: 'message-3', conversationId: 'conversation-1', senderType: 'SYSTEM' };

    conversationRepository.findByIdForCustomer.mockResolvedValue({
      id: 'conversation-1',
      customerId: 'customer-1',
      status: 'AI_HANDLING',
    });
    conversationRepository.findById.mockResolvedValue({
      id: 'conversation-1',
      customerId: 'customer-1',
      status: 'AI_HANDLING',
    });
    conversationRepository.createCustomerMessage.mockResolvedValue(customerMessage);
    generateReply.mockResolvedValue({
      content: 'I need a person.',
      confidence: 0.2,
      grounded: true,
      shouldEscalate: true,
    });
    conversationRepository.createAiMessage.mockResolvedValue(assistantMessage);
    conversationRepository.createSystemMessage.mockResolvedValue(handoffMessage);
    conversationRepository.updateStatus.mockResolvedValue({
      id: 'conversation-1',
      customerId: 'customer-1',
      status: 'ESCALATED',
    });
    ticketService.createForCustomer.mockResolvedValue({
      id: 'ticket-1',
      conversationId: 'conversation-1',
      customerId: 'customer-1',
      status: 'OPEN',
    });

    const result = await ConversationService.addCustomerMessage(
      'conversation-1',
      'customer-1',
      'I need help',
    );

    expect(result.assistantMessage).toEqual(assistantMessage);
    expect(ticketService.createForCustomer).toHaveBeenCalledWith(
      'customer-1',
      'conversation-1',
      expect.objectContaining({ subject: expect.any(String) }),
    );
    expect(notificationService.create).toHaveBeenCalledWith(
      'customer-1',
      'AI_HANDOFF',
      expect.objectContaining({ type: 'AI_HANDOFF' }),
    );
    expect(conversationRepository.updateStatus).toHaveBeenCalledWith('conversation-1', 'ESCALATED');
  });

  it('keeps a degraded 503 response as a persisted escalation instead of a raw failure', async () => {
    const customerMessage = { id: 'message-1', conversationId: 'conversation-1', senderType: 'CUSTOMER' };
    const degradedMessage = { id: 'message-2', conversationId: 'conversation-1', senderType: 'SYSTEM' };

    conversationRepository.findByIdForCustomer.mockResolvedValue({
      id: 'conversation-1',
      customerId: 'customer-1',
      status: 'AI_HANDLING',
    });
    conversationRepository.findById.mockResolvedValue({
      id: 'conversation-1',
      customerId: 'customer-1',
      status: 'AI_HANDLING',
    });
    conversationRepository.createCustomerMessage.mockResolvedValue(customerMessage);
    generateReply.mockRejectedValue({ statusCode: 503, message: 'AI service unavailable' });
    conversationRepository.createSystemMessage.mockResolvedValue(degradedMessage);
    conversationRepository.updateStatus.mockResolvedValue({
      id: 'conversation-1',
      customerId: 'customer-1',
      status: 'ESCALATED',
    });
    ticketService.createForCustomer.mockResolvedValue({
      id: 'ticket-1',
      conversationId: 'conversation-1',
      customerId: 'customer-1',
      status: 'OPEN',
    });

    const result = await ConversationService.addCustomerMessage(
      'conversation-1',
      'customer-1',
      'I need help',
    );

    expect(result.assistantMessage).toEqual(degradedMessage);
    expect(result.degraded).toBe(true);
    expect(conversationRepository.createSystemMessage).toHaveBeenCalled();
    expect(ticketService.createForCustomer).toHaveBeenCalledTimes(1);
  });

  it('does not create a duplicate ticket when the same conversation is escalated twice', async () => {
    conversationRepository.findByIdForCustomer.mockResolvedValue({
      id: 'conversation-1',
      customerId: 'customer-1',
      status: 'ESCALATED',
    });
    conversationRepository.findById.mockResolvedValue({
      id: 'conversation-1',
      customerId: 'customer-1',
      status: 'ESCALATED',
    });
    conversationRepository.createCustomerMessage.mockResolvedValue({
      id: 'message-1',
      conversationId: 'conversation-1',
      senderType: 'CUSTOMER',
    });
    generateReply.mockResolvedValue({
      content: 'A human will help.',
      confidence: 0.1,
      grounded: true,
      shouldEscalate: true,
    });
    conversationRepository.createAiMessage.mockResolvedValue({
      id: 'message-2',
      conversationId: 'conversation-1',
      senderType: 'AI',
    });

    await ConversationService.addCustomerMessage('conversation-1', 'customer-1', 'I need help');

    expect(ticketService.createForCustomer).not.toHaveBeenCalled();
  });

  it('registers an agent reply and moves the conversation to WITH_AGENT', async () => {
    const customerId = 'customer-1';
    const agentId = 'agent-1';
    conversationRepository.findByIdForCustomer.mockResolvedValue(null);
    conversationRepository.findById.mockResolvedValue({
      id: 'conversation-1',
      customerId,
      agentId,
      status: 'ESCALATED',
    });
    conversationRepository.createAgentMessage.mockResolvedValue({
      id: 'message-3',
      conversationId: 'conversation-1',
      senderType: 'AGENT',
      senderId: agentId,
      content: 'I can help',
    });
    conversationRepository.updateStatus.mockResolvedValue({
      id: 'conversation-1',
      customerId,
      agentId,
      status: 'WITH_AGENT',
    });

    const result = await ConversationService.addAgentMessage(
      'conversation-1',
      { content: 'I can help' },
      agentId,
      'AGENT',
    );

    expect(result.message.content).toBe('I can help');
    expect(conversationRepository.updateStatus).toHaveBeenCalledWith('conversation-1', 'WITH_AGENT');
    expect(notificationService.create).toHaveBeenCalledWith(
      customerId,
      'AGENT_REPLIED',
      expect.objectContaining({ type: 'AGENT_REPLIED' }),
    );
  });
});
