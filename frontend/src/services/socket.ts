import { io, type Socket } from 'socket.io-client';

export type RealtimeEvents = {
  ticket_updated: (event: { ticketId: string; status: string }) => void;
  agent_assigned: (event: { ticketId: string; agentId: string }) => void;
  notification: (event: { type: string; message: string; resourceId?: string }) => void;
  conversation_message: (event: {
    messageId: string;
    conversationId: string;
    senderType: 'CUSTOMER' | 'AGENT' | 'AI' | 'SYSTEM';
    senderId: string;
    content: string;
    createdAt: string;
  }) => void;
};

export type ClientEvents = {
  subscribe: (
    subscription: { resource: 'conversation' | 'ticket'; resourceId: string },
    acknowledge?: (response: { ok: boolean }) => void,
  ) => void;
  unsubscribe: (subscription: { resource: 'conversation' | 'ticket'; resourceId: string }) => void;
};

export function createSocket(accessToken: string): Socket<RealtimeEvents, ClientEvents> {
  return io(import.meta.env.VITE_SOCKET_URL || window.location.origin, {
    auth: { token: accessToken },
    withCredentials: true,
  }) as Socket<RealtimeEvents, ClientEvents>;
}