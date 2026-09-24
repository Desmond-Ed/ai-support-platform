import { useEffect } from 'react';
import type { Socket } from 'socket.io-client';
import type { RealtimeEvents } from '../services/socket';

export function useRealtime(
  socket: Socket<RealtimeEvents> | null,
  handlers: Partial<{ [Event in keyof RealtimeEvents]: (payload: RealtimeEvents[Event]) => void }>,
): void {
  useEffect(() => {
    if (!socket) return;

    for (const [event, handler] of Object.entries(handlers)) {
      if (handler) socket.on(event as keyof RealtimeEvents, handler as never);
    }

    return () => {
      for (const [event, handler] of Object.entries(handlers)) {
        if (handler) socket.off(event as keyof RealtimeEvents, handler as never);
      }
    };
  }, [handlers, socket]);
}