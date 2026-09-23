import { beforeEach, describe, expect, it, vi } from 'vitest';

const conversationRepository = vi.hoisted(() => ({
  findByCustomerId: vi.fn(),
  create: vi.fn(),
  findByIdForCustomer: vi.fn(),
  createCustomerMessage: vi.fn(),
  createAiMessage: vi.fn(),
}));

const generateReply = vi.hoisted(() => vi.fn());

vi.mock('../src/repositories/ConversationRepository.js', () => ({
  ConversationRepository: conversationRepository,
}));
vi.mock('../src/services/ai.service.js', () => ({ generateReply }));

import { ConversationService } from '../src/services/conversation.service.js';

beforeEach(() => {
  vi.resetAllMocks();
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
});
