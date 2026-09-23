import type { Server as HttpServer } from 'http';
import { Server as SocketIOServer, type Socket } from 'socket.io';
import { env } from '../config/env.js';
import { verifyAccessToken } from '../utils/jwt.js';
import { logger } from '../utils/logger.js';

export const socketRooms = {
  user: (userId: string) => `user:${userId}`,
  conversation: (conversationId: string) => `conversation:${conversationId}`,
  ticket: (ticketId: string) => `ticket:${ticketId}`,
};

export type RealtimeEvents = {
  ticket_updated: { ticketId: string; status: string };
  agent_assigned: { ticketId: string; agentId: string };
  notification: { type: string; message: string; resourceId?: string };
};

function accessToken(socket: Socket): string {
  const authToken = socket.handshake.auth?.token;
  if (typeof authToken === 'string') return authToken;

  const authorization = socket.handshake.headers.authorization;
  if (typeof authorization === 'string' && authorization.startsWith('Bearer ')) {
    return authorization.slice('Bearer '.length).trim();
  }

  return '';
}

export function authenticateSocket(socket: Socket, next: (error?: Error) => void): void {
  try {
    const token = accessToken(socket);
    if (!token) {
      next(new Error('Authentication required'));
      return;
    }

    socket.data.user = verifyAccessToken(token);
    next();
  } catch {
    next(new Error('Invalid or expired access token'));
  }
}

export function initSocketServer(httpServer: HttpServer): SocketIOServer {
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: env.CORS_ORIGIN,
      credentials: true,
    },
  });

  io.use(authenticateSocket);

  io.on('connection', (socket) => {
    const userId = socket.data.user.sub;
    void socket.join(socketRooms.user(userId));
    logger.info('Socket connected', { socketId: socket.id });

    socket.on('disconnect', (reason) => {
      logger.info('Socket disconnected', { socketId: socket.id, reason });
    });
  });

  return io;
}

export function emitTicketUpdated(
  io: SocketIOServer,
  userIds: string[],
  payload: RealtimeEvents['ticket_updated'],
): void {
  for (const userId of userIds) {
    io.to(socketRooms.user(userId)).emit('ticket_updated', payload);
  }
}

export function emitAgentAssigned(
  io: SocketIOServer,
  userIds: string[],
  payload: RealtimeEvents['agent_assigned'],
): void {
  for (const userId of userIds) {
    io.to(socketRooms.user(userId)).emit('agent_assigned', payload);
  }
}

export function emitNotification(
  io: SocketIOServer,
  userIds: string[],
  payload: RealtimeEvents['notification'],
): void {
  for (const userId of userIds) {
    io.to(socketRooms.user(userId)).emit('notification', payload);
  }
}
