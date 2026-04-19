import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { redis } from '../db/redis.js';
import { env } from '../config/env.js';

/**
 * Per-IP rate limiter using Redis as backing store.
 * Matches the spec: 10 requests/sec per user (strict).
 */
export const apiRateLimit = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore({
    sendCommand: async (...args: string[]): Promise<never> => {
      return (await (redis as unknown as { call: (...a: string[]) => Promise<unknown> }).call(
        ...args,
      )) as never;
    },
    prefix: 'ratelimit:api:',
  }),
  message: { error: 'Too many requests — slow down' },
});

/**
 * Stricter limiter for auth endpoints — prevent brute-force.
 * 5 attempts per minute per IP.
 */
export const authRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore({
    sendCommand: async (...args: string[]): Promise<never> => {
      return (await (redis as unknown as { call: (...a: string[]) => Promise<unknown> }).call(
        ...args,
      )) as never;
    },
    prefix: 'ratelimit:auth:',
  }),
  message: { error: 'Too many authentication attempts — please wait a minute' },
});
