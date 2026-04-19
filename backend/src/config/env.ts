import { writeSync } from 'node:fs';
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

/**
 * Environment variable schema.
 * All config values are validated at startup — the app refuses to boot with invalid config.
 */
const envSchema = z.object({
    NODE_ENV: z.enum(['development', 'staging', 'production', 'test']).default('development'),
    PORT: z.coerce.number().int().positive().default(3000),

    // Database
    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

    // Redis
    REDIS_URL: z.string().min(1, 'REDIS_URL is required'),

    // JWT / Auth
    JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
    JWT_EXPIRES_IN: z.string().default('30d'),

    // CORS
    CORS_ORIGIN: z.string().default('*'),

    // App
    APP_URL: z.string().url().default('http://localhost:3000'),
    MATCH_INVITE_EXPIRY_MINUTES: z.coerce.number().int().positive().default(60),
    DISCONNECT_GRACE_MS: z.coerce.number().int().nonnegative().default(0),
    ABANDONED_MATCH_CLEANUP_DAYS: z.coerce.number().int().positive().default(7),

    // Rate limiting
    RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(1000),
    RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
});

// Synchronous pre-boot env dump — writeSync guarantees output even before event loop
writeSync(1, '[ENV CHECK] NODE_ENV=' + (process.env.NODE_ENV ?? 'MISSING') + '\n');
writeSync(1, '[ENV CHECK] PORT=' + (process.env.PORT ?? 'MISSING') + '\n');
writeSync(1, '[ENV CHECK] DATABASE_URL=' + (process.env.DATABASE_URL ? 'SET(len=' + process.env.DATABASE_URL.length + ')' : 'MISSING') + '\n');
writeSync(1, '[ENV CHECK] REDIS_URL=' + (process.env.REDIS_URL ? 'SET(len=' + process.env.REDIS_URL.length + ')' : 'MISSING') + '\n');
writeSync(1, '[ENV CHECK] JWT_SECRET=' + (process.env.JWT_SECRET ? 'SET(len=' + process.env.JWT_SECRET.length + ')' : 'MISSING') + '\n');

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
    writeSync(1, '\u274c [ENV] Invalid environment configuration:\n');
    writeSync(1, JSON.stringify(parsed.error.flatten().fieldErrors, null, 2) + '\n');
    process.exit(1);
}

writeSync(1, '[ENV] All environment variables validated OK\n');

export const env = parsed.data;
export const isProduction = env.NODE_ENV === 'production';
export const isDevelopment = env.NODE_ENV === 'development';
