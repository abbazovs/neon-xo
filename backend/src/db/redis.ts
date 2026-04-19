import { Redis } from 'ioredis';
import { env } from '../config/env.js';

/**
 * Redis client — used for:
 * - Socket.IO adapter (horizontal scaling across Railway replicas)
 * - Rate limiting (per-user request buckets)
 * - Online presence tracking (user:online set)
 * - Active match state / quick-match queue
 */
export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
  lazyConnect: false,
});

// Pub/sub clients for Socket.IO Redis adapter (must be separate connections)
export const pubClient = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
export const subClient = pubClient.duplicate();

redis.on('error', (err: Error) => console.error('Redis error:', err));
redis.on('connect', () => console.info('✅ Redis connected'));

export async function closeRedis(): Promise<void> {
  await Promise.all([redis.quit(), pubClient.quit(), subClient.quit()]);
}

// Presence helpers
const ONLINE_KEY = 'presence:online';
const USER_SOCKETS_PREFIX = 'presence:user:';

export async function markOnline(userId: string, socketId: string): Promise<void> {
  await redis.sadd(ONLINE_KEY, userId);
  await redis.set(`${USER_SOCKETS_PREFIX}${userId}`, socketId, 'EX', 3600);
}

export async function markOffline(userId: string): Promise<void> {
  await redis.srem(ONLINE_KEY, userId);
  await redis.del(`${USER_SOCKETS_PREFIX}${userId}`);
}

export async function isOnline(userId: string): Promise<boolean> {
  return (await redis.sismember(ONLINE_KEY, userId)) === 1;
}

export async function getOnlineUsers(userIds: string[]): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  const pipeline = redis.pipeline();
  userIds.forEach((id) => pipeline.sismember(ONLINE_KEY, id));
  const results = await pipeline.exec();
  const online = new Set<string>();
  results?.forEach((res: [Error | null, unknown], i: number) => {
    if (res[1] === 1) online.add(userIds[i]);
  });
  return online;
}

export async function getUserSocket(userId: string): Promise<string | null> {
  return redis.get(`${USER_SOCKETS_PREFIX}${userId}`);
}
