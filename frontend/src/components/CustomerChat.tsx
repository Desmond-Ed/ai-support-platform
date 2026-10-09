import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { Conversation, ConversationMessage } from '../services/api';
import { api } from '../services/api';
import { createSocket, type ClientEvents, type RealtimeEvents } from '../services/socket';
import type { Socket } from 'socket.io-client';

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

function senderLabel(senderType: ConversationMessage['senderType']): string {
  return senderType === 'CUSTOMER' ? 'You' : senderType;
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

    if (client) {
      client.on('conversation_message', receiveMessage);
      client.emit('subscribe', subscription, (acknowledgement) => {
        if (active && !acknowledgement.ok) setError('Unable to subscribe to this conversation.');
      });
    }

    api.getMessages(token, conversationId)
      .then(({ messages: history }) => {
        if (active) setMessages((current) => mergeMessages(current, history));
      })
      .catch((loadError: Error) => active && setError(loadError.message))
      .finally(() => active && setIsLoadingHistory(false));

    return () => {
      active = false;
      if (client) {
        client.off('conversation_message', receiveMessage);
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

  return (
    <section aria-labelledby="customer-chat-heading" className="mb-8 rounded-xl border border-slate-800 bg-slate-900/70 p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div>
          <p className="text-xs font-medium uppercase text-cyan-300">Support</p>
          <h2 id="customer-chat-heading" className="mt-1 text-lg font-semibold">Your conversations</h2>
        </div>
        <button
          data-testid="chat-new"
          type="button"
          className="rounded-lg bg-cyan-300 px-3 py-2 text-sm font-semibold text-slate-950 disabled:opacity-60"
          disabled={isCreating}
          onClick={createConversation}
        >
          {isCreating ? 'Creating…' : 'New conversation'}
        </button>
      </div>

      {error && <p className="mb-4 rounded-lg border border-rose-400/40 bg-rose-400/10 px-3 py-2 text-sm text-rose-200" role="alert">{error}</p>}
      {showBanner && (
        <p data-testid="chat-banner" className="mb-4 rounded-lg border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-sm text-amber-100">
          A support agent will follow up
        </p>
      )}

      <div className="grid min-h-[24rem] gap-4 md:grid-cols-[14rem_minmax(0,1fr)]">
        <nav aria-label="Conversation list" className="space-y-2 border-b border-slate-800 pb-3 md:border-b-0 md:border-r md:pb-0 md:pr-3">
          {isLoading && <p className="px-2 py-3 text-sm text-slate-500">Loading conversations…</p>}
          {!isLoading && conversations.length === 0 && <p className="px-2 py-3 text-sm text-slate-500">No conversations yet.</p>}
          {conversations.map((conversation) => (
            <button
              key={conversation.id}
              data-testid="chat-conversation"
              data-conversation-id={conversation.id}
              type="button"
              aria-pressed={conversation.id === activeId}
              className={`w-full rounded-lg px-3 py-2 text-left ${conversation.id === activeId ? 'bg-cyan-300/10 text-cyan-100' : 'text-slate-300 hover:bg-slate-800'}`}
              onClick={() => openConversation(conversation.id)}
            >
              <span className="block text-sm font-medium">Conversation {conversation.id.slice(0, 8)}</span>
              <span className="mt-1 block text-xs text-slate-500">{conversation.status.replace('_', ' ')}</span>
            </button>
          ))}
        </nav>

        <div className="flex min-h-[24rem] min-w-0 flex-col">
          {activeConversation ? (
            <>
              <div aria-live="polite" className="mb-3 flex-1 space-y-3 overflow-y-auto rounded-lg bg-slate-950/60 p-3">
                {messages.length === 0 && !isLoadingHistory && <p className="py-8 text-center text-sm text-slate-500">Send a message to start this conversation.</p>}
                {messages.map((message) => {
                  const isCustomer = message.senderType === 'CUSTOMER';
                  return (
                    <article
                      key={message.id}
                      data-testid="chat-message"
                      className={`flex ${isCustomer ? 'justify-end' : 'justify-start'}`}
                    >
                      <div className={`max-w-[85%] rounded-xl px-3 py-2 ${isCustomer ? 'bg-cyan-300 text-slate-950' : 'bg-slate-800 text-slate-100'}`}>
                        <p className="mb-1 text-xs font-semibold opacity-70">{senderLabel(message.senderType)}</p>
                        <p className="whitespace-pre-wrap break-words text-sm">{message.content}</p>
                      </div>
                    </article>
                  );
                })}
              </div>
              <form className="flex items-end gap-2" onSubmit={sendMessage}>
                <textarea
                  data-testid="chat-input"
                  aria-label="Message"
                  className="min-h-12 min-w-0 flex-1 resize-y rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-400 disabled:opacity-60"
                  disabled={isSending}
                  placeholder="Write a message…"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  rows={2}
                />
                <button
                  data-testid="chat-send"
                  className="rounded-lg bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={isSending || !draft.trim()}
                  type="submit"
                >
                  {isSending ? 'Sending…' : 'Send'}
                </button>
              </form>
            </>
          ) : (
            <div className="grid flex-1 place-items-center rounded-lg bg-slate-950/40 px-5 text-center text-sm text-slate-500">
              {isLoading ? 'Loading your conversations…' : 'Choose a conversation or start a new one.'}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}