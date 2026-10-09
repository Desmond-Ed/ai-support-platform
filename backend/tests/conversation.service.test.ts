import { beforeEach, describe, expect, it, vi } from 'vitest';

const prisma = vi.hoisted(() => ({
  user: { findMany: vi.fn() },
  $transaction: vi.fn(),
}));

const transactionClient = vi.hoisted(() => ({
  conversation: { updateMany: vi.fn() },
  ticket: { create: vi.fn() },
}));

const conversationRepository = vi.hoisted(() => ({
  findByCustomerId: vi.fn(),
  create: vi.fn(),
  findById: vi.fn(),
  findByIdForCustomer: vi.fn(),
  listMessages: vi.fn(),
  createCustomerMessage: vi.fn(),
  createAiMessage: vi.fn(),
  createSystemMessage: vi.fn(),
  createAgentMessage: vi.fn(),
  updateStatus: vi.fn(),
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
vi.mock('../src/services/notification.service.js', () => ({
  NotificationService: notificationService,
}));

import { ConversationService } from '../src/services/conversation.service.js';

beforeEach(() => {
  vi.resetAllMocks();
  prisma.user.findMany.mockResolvedValue([{ id: 'agent-1' }]);
  prisma.$transaction.mockImplementation((callback) => callback(transactionClient));
  transactionClient.conversation.updateMany.mockResolvedValue({ count: 1 });
  transactionClient.ticket.create.mockResolvedValue({
    id: 'ticket-1',
    conversationId: 'conversation-1',
    customerId: 'customer-1',
    subject: 'Conversation #conversa',
    status: 'OPEN',
  });
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

  it('hands off an owned customer conversation', async () => {
    const conversation = {
      id: 'conversation-1',
      customerId: 'customer-1',
      status: 'ESCALATED',
    };
    conversationRepository.findByIdForCustomer.mockResolvedValue({
      ...conversation,
      status: 'AI_HANDLING',
    });
    conversationRepository.findById.mockResolvedValue(conversation);

    const result = await ConversationService.handoffForCustomer(
      'conversation-1',
      'customer-1',
      'CUSTOMER',
    );

    expect(result).toBe(conversation);
    expect(transactionClient.ticket.create).toHaveBeenCalledTimes(1);
    expect(notificationService.create).toHaveBeenCalledWith(
      'customer-1',
      'AI_HANDOFF',
      expect.objectContaining({ type: 'AI_HANDOFF' }),
    );
  });

  it('returns 404 when a customer does not own the conversation', async () => {
    conversationRepository.findByIdForCustomer.mockResolvedValue(null);

    await expect(
      ConversationService.handoffForCustomer('conversation-1', 'customer-2', 'CUSTOMER'),
    ).rejects.toMatchObject({ statusCode: 404, message: 'Conversation not found' });
    expect(transactionClient.ticket.create).not.toHaveBeenCalled();
  });

  it('does not create a second ticket when handoff is requested twice', async () => {
    const conversation = {
      id: 'conversation-1',
      customerId: 'customer-1',
      status: 'ESCALATED',
    };
    conversationRepository.findByIdForCustomer.mockResolvedValue({
      ...conversation,
      status: 'AI_HANDLING',
    });
    conversationRepository.findById.mockResolvedValue(conversation);
    transactionClient.conversation.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    await ConversationService.handoffForCustomer('conversation-1', 'customer-1', 'CUSTOMER');
    await ConversationService.handoffForCustomer('conversation-1', 'customer-1', 'CUSTOMER');

    expect(transactionClient.ticket.create).toHaveBeenCalledTimes(1);
  });

  it('lists history for the customer who owns the conversation', async () => {
    const messages = [{ id: 'message-1', conversationId: 'conversation-1', content: 'Hello' }];
    conversationRepository.findByIdForCustomer.mockResolvedValue({
      id: 'conversation-1',
      customerId: 'customer-1',
    });
    conversationRepository.listMessages.mockResolvedValue(messages);

    const result = await ConversationService.listMessages('conversation-1', 'customer-1', 'CUSTOMER');

    expect(result).toBe(messages);
    expect(conversationRepository.findByIdForCustomer).toHaveBeenCalledWith('conversation-1', 'customer-1');
    expect(conversationRepository.listMessages).toHaveBeenCalledWith('conversation-1');
  });

  it('returns 404 when another customer requests conversation history', async () => {
    conversationRepository.findByIdForCustomer.mockResolvedValue(null);

    await expect(
      ConversationService.listMessages('conversation-1', 'customer-2', 'CUSTOMER'),
    ).rejects.toMatchObject({ statusCode: 404, message: 'Conversation not found' });
    expect(conversationRepository.listMessages).not.toHaveBeenCalled();
  });

  it('lists history for the agent assigned to the conversation', async () => {
    const messages = [{ id: 'message-1', conversationId: 'conversation-1', content: 'Hello' }];
    conversationRepository.findById.mockResolvedValue({
      id: 'conversation-1',
      customerId: 'customer-1',
      agentId: 'agent-1',
    });
    conversationRepository.listMessages.mockResolvedValue(messages);

    const result = await ConversationService.listMessages('conversation-1', 'agent-1', 'AGENT');

    expect(result).toBe(messages);
    expect(conversationRepository.listMessages).toHaveBeenCalledWith('conversation-1');
  });

  it('returns 403 when an unassigned agent requests conversation history', async () => {
    conversationRepository.findById.mockResolvedValue({
      id: 'conversation-1',
      customerId: 'customer-1',
      agentId: 'agent-1',
    });

    await expect(
      ConversationService.listMessages('conversation-1', 'agent-2', 'AGENT'),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(conversationRepository.listMessages).not.toHaveBeenCalled();
  });

  it('allows an admin to list conversation history', async () => {
    const messages = [{ id: 'message-1', conversationId: 'conversation-1', content: 'Hello' }];
    conversationRepository.findById.mockResolvedValue({
      id: 'conversation-1',
      customerId: 'customer-1',
      agentId: 'agent-1',
    });
    conversationRepository.listMessages.mockResolvedValue(messages);

    const result = await ConversationService.listMessages('conversation-1', 'admin-1', 'ADMIN');

    expect(result).toBe(messages);
    expect(conversationRepository.listMessages).toHaveBeenCalledWith('conversation-1');
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
    conversationRepository.createCustomerMessage.mockResolvedValue(customerMessage);
    generateReply.mockResolvedValue({
      content: 'I need a person.',
      confidence: 0.2,
      grounded: true,
      shouldEscalate: true,
    });
    conversationRepository.createAiMessage.mockResolvedValue(assistantMessage);
    conversationRepository.createSystemMessage.mockResolvedValue(handoffMessage);
    const result = await ConversationService.addCustomerMessage(
      'conversation-1',
      'customer-1',
      'I need help',
    );

    expect(result.assistantMessage).toEqual(assistantMessage);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(transactionClient.conversation.updateMany).toHaveBeenCalledWith({
      where: { id: 'conversation-1', status: 'AI_HANDLING' },
      data: { status: 'ESCALATED' },
    });
    expect(transactionClient.ticket.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        conversationId: 'conversation-1',
        customerId: 'customer-1',
        subject: expect.any(String),
      }),
    });
    expect(notificationService.create).toHaveBeenCalledWith(
      'customer-1',
      'AI_HANDOFF',
      expect.objectContaining({ type: 'AI_HANDOFF' }),
    );
    expect(notificationService.create).toHaveBeenCalledWith(
      'customer-1',
      'TICKET_CREATED',
      expect.objectContaining({
        type: 'TICKET_CREATED',
        message: 'Ticket Conversation #conversa was created',
        resourceId: 'ticket-1',
      }),
    );
    expect(conversationRepository.updateStatus).not.toHaveBeenCalled();
  });

  it('keeps a degraded 503 response as a persisted escalation instead of a raw failure', async () => {
    const customerMessage = { id: 'message-1', conversationId: 'conversation-1', senderType: 'CUSTOMER' };
    const degradedMessage = { id: 'message-2', conversationId: 'conversation-1', senderType: 'SYSTEM' };

    conversationRepository.findByIdForCustomer.mockResolvedValue({
      id: 'conversation-1',
      customerId: 'customer-1',
      status: 'AI_HANDLING',
    });
    conversationRepository.createCustomerMessage.mockResolvedValue(customerMessage);
    generateReply.mockRejectedValue({ statusCode: 503, message: 'AI service unavailable' });
    conversationRepository.createSystemMessage.mockResolvedValue(degradedMessage);
    const result = await ConversationService.addCustomerMessage(
      'conversation-1',
      'customer-1',
      'I need help',
    );

    expect(result.assistantMessage).toEqual(degradedMessage);
    expect(result.degraded).toBe(true);
    expect(conversationRepository.createSystemMessage).toHaveBeenCalled();
    expect(transactionClient.ticket.create).toHaveBeenCalledTimes(1);
  });

  it('does not create a duplicate ticket when the same conversation is escalated twice', async () => {
      transactionClient.conversation.updateMany.mockResolvedValue({ count: 0 });
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

    expect(transactionClient.ticket.create).not.toHaveBeenCalled();
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

  it.each(['RESOLVED', 'CLOSED'] as const)('rejects an agent reply to a %s conversation', async (status) => {
    conversationRepository.findById.mockResolvedValue({
      id: 'conversation-1',
      customerId: 'customer-1',
      agentId: 'agent-1',
      status,
    });

    await expect(
      ConversationService.addAgentMessage('conversation-1', { content: 'Reply' }, 'agent-1', 'AGENT'),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(conversationRepository.createAgentMessage).not.toHaveBeenCalled();
  });
});
