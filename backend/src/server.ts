import { createServer } from 'http';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { initSocketServer } from './sockets/index.js';

const app = createApp();
const httpServer = createServer(app);

// Socket.IO is attached to the same HTTP server (not a separate port) so
// Railway only needs to expose one port for the backend service.
initSocketServer(httpServer);

httpServer.listen(env.PORT, () => {
  logger.info(`Backend listening on port ${env.PORT}`, { env: env.NODE_ENV });
});

function shutdown(signal: string): void {
  logger.info(`Received ${signal}, shutting down gracefully`);
  httpServer.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
