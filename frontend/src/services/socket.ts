import { io, type Socket } from 'socket.io-client';

export type RealtimeEvents = {
  ticket_updated: (event: { ticketId: string; status: string }) => void;
  agent_assigned: (event: { ticketId: string; agentId: string }) => void;
  notification: (event: { type: string; message: string; resourceId?: string }) => void;
};

export function createSocket(accessToken: string): Socket<RealtimeEvents> {
  return io(import.meta.env.VITE_SOCKET_URL || window.location.origin, {
    auth: { token: accessToken },
    withCredentials: true,
  });
}