import { io } from 'socket.io-client';
import { TOKEN_KEY } from './client.js';

let socket = null;

/**
 * Shared Socket.IO connection authenticated with the same JWT as the REST API.
 * Only used for live job feedback; failures degrade gracefully to polling.
 */
export function getSocket() {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) return null;
  if (!socket) {
    socket = io('/', {
      path: '/socket.io',
      auth: { token },
      transports: ['websocket', 'polling'],
    });
  }
  return socket;
}

export function closeSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

export default getSocket;
