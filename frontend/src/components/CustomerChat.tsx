import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { Conversation, ConversationMessage } from '../services/api';
import { api } from '../services/api';
import { createSocket, type ClientEvents, type RealtimeEvents } from '../services/socket';
import type { Socket } from 'socket.io-client';

type ConversationExchange = {
  customerMessage?: ConversationMessage;
  replies: ConversationMessage[];
};

function mergeMessages(
  current: ConversationMessage[],
  incoming: ConversationMessage[],
): ConversationMessage[] {
  const byId = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) byId.set(message.id, message);
  return [...byId.values()].sort(
    (left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt),
  );
}

function groupMessages(messages: ConversationMessage[]): ConversationExchange[] {
  const exchanges: ConversationExchange[] = [];
  for (const message of messages) {
    if (message.senderType === 'CUSTOMER') {
      exchanges.push({ customerMessage: message, replies: [] });
    } else if (exchanges.length === 0) {
      exchanges.push({ replies: [message] });
    } else {
      exchanges[exchanges.length - 1].replies.push(message);
    }
  }
  return exchanges;
}

function senderLabel(senderType: ConversationMessage['senderType']): string {
  return senderType === 'AI' ? 'Support' : senderType === 'SYSTEM' ? 'Service update' : 'Support agent';
}

function statusLabel(status: Conversation['status']): string {
  return status.replaceAll('_', ' ').toLowerCase();
}

function statusClass(status: Conversation['status']): string {
  if (status === 'ESCALATED' || status === 'WITH_AGENT') {
    return 'bg-amber-tint text-amber-ink';
  }
  if (status === 'RESOLVED') {
    return 'bg-resolved-tint text-resolved-ink';
  }
  return 'bg-ground text-muted-ink';
}

export function CustomerChat({ token }: { token: string }) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [draft, setDraft] = useState('');
  const socketRef = useRef<Socket<RealtimeEvents, ClientEvents> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const [isCreating, setIsCreating] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isHandingOff, setIsHandingOff] = useState(false);
  const [error, setError] = useState('');
  const [degraded, setDegraded] = useState(false);

  const activeConversation = conversations.find((conversation) => conversation.id === activeId) ?? null;
  const showBanner = degraded || activeConversation?.status === 'ESCALATED' || activeConversation?.status === 'WITH_AGENT';

  useEffect(() => {
    let active = true;
    api.listConversations(token)
      .then(({ conversations: loaded }) => {
        if (!active) return;
        setConversations(loaded);
        setIsLoadingHistory(loaded.length > 0);
        setActiveId((current) => current ?? loaded[0]?.id ?? null);
      })
      .catch((loadError: Error) => active && setError(loadError.message))
      .finally(() => active && setIsLoading(false));
    return () => {
      active = false;
    };
  }, [token]);

  useEffect(() => {
    const client = createSocket(token);
    socketRef.current = client;
    return () => {
      client.disconnect();
      socketRef.current = null;
    };
  }, [token]);

  useEffect(() => {
    if (!activeId) return;

    let active = true;
    const conversationId = activeId;
    const subscription = { resource: 'conversation' as const, resourceId: conversationId };
    const client = socketRef.current;

    const receiveMessage = (event: Parameters<RealtimeEvents['conversation_message']>[0]) => {
      if (event.conversationId !== conversationId) return;
      setMessages((current) => mergeMessages(current, [{
        id: event.messageId,
        conversationId: event.conversationId,
        senderType: event.senderType,
        senderId: event.senderId,
        content: event.content,
        createdAt: event.createdAt,
      }]));
    };

    const subscribe = () => {
      client?.emit('subscribe', subscription, (acknowledgement) => {
        if (active && !acknowledgement.ok) setError('Unable to subscribe to this conversation.');
      });
    };

    const refreshHistory = async () => {
      try {
        const { messages: history } = await api.getMessages(token, conversationId);
        if (active) setMessages((current) => mergeMessages(current, history));
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Unable to load conversation history.');
      } finally {
        if (active) setIsLoadingHistory(false);
      }
    };

    const onConnect = () => {
      subscribe();
      void refreshHistory();
    };

    if (client) {
      client.on('conversation_message', receiveMessage);
      client.on('connect', onConnect);
      if (client.connected) subscribe();
    }

    void refreshHistory();

    return () => {
      active = false;
      if (client) {
        client.off('conversation_message', receiveMessage);
        client.off('connect', onConnect);
        client.emit('unsubscribe', subscription);
      }
    };
  }, [activeId, historyRefreshKey, token]);

  function openConversation(conversationId: string) {
    setMessages([]);
    setError('');
    setDegraded(false);
    setIsLoadingHistory(true);
    setActiveId(conversationId);
    setHistoryRefreshKey((current) => current + 1);
  }

  async function createConversation() {
    setError('');
    setIsCreating(true);
    try {
      const { conversation } = await api.createConversation(token);
      setConversations((current) => [conversation, ...current]);
      setMessages([]);
      setIsLoadingHistory(true);
      setError('');
      setActiveId(conversation.id);
      setDegraded(false);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Unable to create conversation.');
    } finally {
      setIsCreating(false);
    }
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = draft.trim();
    if (!activeConversation || !content || isSending) return;

    setError('');
    setIsSending(true);
    try {
      const response = await api.sendMessage(token, activeConversation.id, content);
      setMessages((current) => mergeMessages(current, [
        response.customerMessage,
        response.assistantMessage,
      ]));
      setDegraded(Boolean(response.degraded) || response.assistantMessage.senderType === 'SYSTEM');
      setDraft('');
      const { conversations: refreshed } = await api.listConversations(token);
      setConversations(refreshed);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : 'Unable to send message.');
    } finally {
      setIsSending(false);
    }
  }

  async function requestHandoff() {
    if (!activeConversation || isHandingOff) return;
    setError('');
    setIsHandingOff(true);
    try {
      const { conversation } = await api.requestHandoff(token, activeConversation.id);
      setConversations((current) => current.map((item) => (
        item.id === conversation.id ? conversation : item
      )));
      setDegraded(false);
    } catch (handoffError) {
      setError(handoffError instanceof Error ? handoffError.message : 'Unable to contact a support agent.');
    } finally {
      setIsHandingOff(false);
    }
  }

  return (
    <section aria-labelledby="customer-chat-heading" className="mb-8 rounded-xl border border-line bg-ground p-4 text-ink sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
        <div>
          <p className="font-sans text-xs font-medium uppercase text-muted-ink">Support</p>
          <h2 id="customer-chat-heading" className="mt-1 font-sans text-lg font-semibold">Your conversations</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            data-testid="chat-handoff"
            type="button"
            className="rounded-lg bg-amber-tint px-3 py-2 font-sans text-sm font-semibold text-amber-ink disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!activeConversation || isHandingOff}
            onClick={requestHandoff}
          >
            {isHandingOff ? 'Contacting…' : 'Talk to a person'}
          </button>
          <button
            data-testid="chat-new"
            type="button"
            className="rounded-lg bg-ink px-3 py-2 font-sans text-sm font-semibold text-ground disabled:opacity-60"
            disabled={isCreating}
            onClick={createConversation}
          >
            {isCreating ? 'Creating…' : 'New conversation'}
          </button>
        </div>
      </div>

      {error && <p className="mb-4 rounded-lg bg-amber-tint px-3 py-2 font-sans text-sm text-amber-ink" role="alert">{error}</p>}
      {showBanner && (
        <p data-testid="chat-banner" className="mb-4 rounded-lg bg-amber-tint px-3 py-2 font-sans text-sm text-amber-ink">
          A support agent will follow up
        </p>
      )}

      <div className="grid min-h-[24rem] gap-4 md:grid-cols-[14rem_minmax(0,1fr)]">
        <nav aria-label="Conversation list" className="space-y-2 border-b border-line pb-3 md:border-b-0 md:border-r md:pb-0 md:pr-3">
          {isLoading && <p className="px-2 py-3 font-sans text-sm text-muted-ink">Loading conversations…</p>}
          {!isLoading && conversations.length === 0 && <p className="px-2 py-3 font-sans text-sm text-muted-ink">No conversations yet.</p>}
          {conversations.map((conversation) => (
            <button
              key={conversation.id}
              data-testid="chat-conversation"
              data-conversation-id={conversation.id}
              type="button"
              aria-pressed={conversation.id === activeId}
              className={`w-full rounded-lg border border-line px-3 py-2 text-left ${conversation.id === activeId ? 'bg-white/70' : 'bg-ground hover:bg-white/50'}`}
              onClick={() => openConversation(conversation.id)}
            >
              <span className="block font-sans text-sm font-medium text-ink">Conversation {conversation.id.slice(0, 8)}</span>
              <span className={`mt-1 inline-block rounded px-2 py-0.5 font-sans text-xs font-medium ${statusClass(conversation.status)}`}>
                {statusLabel(conversation.status)}
              </span>
            </button>
          ))}
        </nav>

        <div className="flex min-h-[24rem] min-w-0 flex-col">
          {activeConversation ? (
            <>
              <div aria-live="polite" className="mb-3 flex-1 overflow-y-auto rounded-lg border border-line bg-white/50 px-4 py-2">
                {messages.length === 0 && !isLoadingHistory && <p className="py-8 text-center font-sans text-sm text-muted-ink">Send a message to start this conversation.</p>}
                {groupMessages(messages).map((exchange, index) => (
                  <article
                    key={exchange.customerMessage?.id ?? exchange.replies[0]?.id ?? index}
                    data-testid="chat-exchange"
                    className="border-b border-line py-4 last:border-b-0"
                  >
                    {exchange.customerMessage && (
                      <div data-testid="chat-message" className="mb-4">
                        <p className="mb-1 font-sans text-xs font-semibold uppercase tracking-wide text-muted-ink">Your question</p>
                        <p className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-ink">
                          {exchange.customerMessage.content}
                        </p>
                      </div>
                    )}
                    {exchange.replies.map((message) => (
                      <div data-testid="chat-message" key={message.id}>
                        <p className="mb-1 font-sans text-xs font-semibold uppercase tracking-wide text-muted-ink">
                          {senderLabel(message.senderType)}
                        </p>
                        <p className="whitespace-pre-wrap break-words font-serif text-xl leading-relaxed text-ink">
                          {message.content}
                        </p>
                        {message.sources && message.sources.length > 0 && (
                          <p className="mt-2 font-sans text-xs text-muted-ink">
                            Sources: {message.sources.map((source) => source.title).join(', ')}
                          </p>
                        )}
                      </div>
                    ))}
                  </article>
                ))}
              </div>
              <form className="flex items-end gap-2" onSubmit={sendMessage}>
                <textarea
                  data-testid="chat-input"
                  aria-label="Message"
                  className="min-h-12 min-w-0 flex-1 resize-y rounded-lg border border-line bg-ground px-3 py-2 font-sans text-sm text-ink outline-none focus:border-amber-ink disabled:opacity-60"
                  disabled={isSending}
                  placeholder="Write a message…"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  rows={2}
                />
                <button
                  data-testid="chat-send"
                  className="rounded-lg bg-ink px-4 py-2 font-sans text-sm font-semibold text-ground disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={isSending || !draft.trim()}
                  type="submit"
                >
                  {isSending ? 'Sending…' : 'Send'}
                </button>
              </form>
            </>
          ) : (
            <div className="grid flex-1 place-items-center rounded-lg border border-line px-5 text-center font-sans text-sm text-muted-ink">
              {isLoading ? 'Loading your conversations…' : 'Choose a conversation or start a new one.'}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
