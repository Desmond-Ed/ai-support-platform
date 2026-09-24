import type { Server as HttpServer } from 'http';
import { Server as SocketIOServer, type Socket } from 'socket.io';
import { prisma } from '../config/db.js';
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

export type ResourceSubscription = {
  resource: 'conversation' | 'ticket';
  resourceId: string;
};

export async function canSubscribeToResource(
  user: { sub: string; role: string },
  subscription: ResourceSubscription,
): Promise<boolean> {
  if (subscription.resource === 'conversation') {
    return Boolean(
      await prisma.conversation.findFirst({
        where:
          user.role === 'CUSTOMER'
            ? { id: subscription.resourceId, customerId: user.sub }
            : { id: subscription.resourceId, OR: [{ customerId: user.sub }, { agentId: user.sub }] },
        select: { id: true },
      }),
    );
  }

  return Boolean(
    await prisma.ticket.findFirst({
      where:
        user.role === 'CUSTOMER'
          ? { id: subscription.resourceId, customerId: user.sub }
          : {
              id: subscription.resourceId,
              OR: [
                { customerId: user.sub },
                { assignments: { some: { agentId: user.sub, unassignedAt: null } } },
              ],
            },
      select: { id: true },
    }),
  );
}

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
  const corsOrigins = [
    ...env.CORS_ORIGIN.split(',').map((origin) => origin.trim()),
    ...(env.NODE_ENV === 'development' ? ['http://localhost:8080'] : []),
  ];
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: corsOrigins,
      credentials: true,
    },
  });

  io.use(authenticateSocket);

  io.on('connection', (socket) => {
    const userId = socket.data.user.sub;
    void socket.join(socketRooms.user(userId));

    socket.on('subscribe', async (subscription: ResourceSubscription, acknowledge?: (response: { ok: boolean }) => void) => {
      if (
        !subscription ||
        !['conversation', 'ticket'].includes(subscription.resource) ||
        typeof subscription.resourceId !== 'string' ||
        !subscription.resourceId
      ) {
        acknowledge?.({ ok: false });
        return;
      }

      const canSubscribe = await canSubscribeToResource(socket.data.user, subscription);

      if (!canSubscribe) {
        acknowledge?.({ ok: false });
        return;
      }

      void socket.join(socketRooms[subscription.resource](subscription.resourceId));
      acknowledge?.({ ok: true });
    });

    socket.on('unsubscribe', (subscription: ResourceSubscription) => {
      if (
        subscription &&
        ['conversation', 'ticket'].includes(subscription.resource) &&
        typeof subscription.resourceId === 'string' &&
        subscription.resourceId
      ) {
        void socket.leave(socketRooms[subscription.resource](subscription.resourceId));
      }
    });
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
