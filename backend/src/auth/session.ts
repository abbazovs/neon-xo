import { nanoid } from 'nanoid';
import { redis } from '../db/redis.js';

/**
 * Session registry.
 * Each user has exactly ONE active session id at a time.
 * Registering a new session invalidates the previous one — enforces single-tab/single-device login.
 * JWTs carry a session id (sid); if the stored sid for that user doesn't match, the token is rejected.
 */

const SESSION_KEY = (userId: string) => `session:user:${userId}`;
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

export async function createSession(userId: string): Promise<string> {
  const sid = nanoid(24);
  await redis.set(SESSION_KEY(userId), sid, 'EX', SESSION_TTL_SECONDS);
  return sid;
}

export async function isSessionValid(userId: string, sid: string): Promise<boolean> {
  const stored = await redis.get(SESSION_KEY(userId));
  return stored === sid;
}

export async function revokeSession(userId: string): Promise<void> {
  await redis.del(SESSION_KEY(userId));
}

export async function logoutAllDevices(userId: string): Promise<void> {
  await revokeSession(userId);
}
