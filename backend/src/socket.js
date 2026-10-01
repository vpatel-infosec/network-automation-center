import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import config from './config/env.js';
import logger from './utils/logger.js';

/**
 * Socket.IO endpoint used by the UI to follow jobs live.
 * Clients authenticate with the same JWT via `auth.token` and subscribe to
 * the rooms they are interested in (`job:<id>`).
 */
export function initSocket(server) {
  const io = new Server(server, {
    path: '/socket.io',
    cors: { origin: config.corsOrigins, credentials: true },
  });

  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('Authentication required'));
      const payload = jwt.verify(token, config.jwtSecret);
      socket.userId = payload.sub;
      return next();
    } catch {
      return next(new Error('Invalid or expired token'));
    }
  });

  io.on('connection', (socket) => {
    logger.debug(`Socket connected: ${socket.id} (user ${socket.userId})`);
    socket.on('job:subscribe', (jobId) => {
      if (jobId) socket.join(`job:${jobId}`);
    });
    socket.on('job:unsubscribe', (jobId) => {
      if (jobId) socket.leave(`job:${jobId}`);
    });
  });

  return io;
}

export default initSocket;
