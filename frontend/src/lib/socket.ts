import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

function tokenFromStorage(): string | undefined {
  return localStorage.getItem('neon-xo-token') ?? undefined;
}

export function getSocket(): Socket {
  if (!socket) {
    socket = io('/', {
      autoConnect: true,
      auth: { token: tokenFromStorage() },
      reconnection: true,
      reconnectionDelay: 500,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: Infinity,
    });
  }
  return socket;
}

/**
 * Call after login/logout so the socket reconnects with new auth.
 */
export function refreshSocketAuth(): void {
  if (!socket) return;
  socket.auth = { token: tokenFromStorage() };
  socket.disconnect();
  socket.connect();
}
