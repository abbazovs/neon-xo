import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { env, isProduction } from './config/env.js';
import { pool, closePool } from './db/pool.js';
import { closeRedis, pubClient, subClient } from './db/redis.js';
import { authRouter } from './routes/auth.js';
import {
  friendsRouter,
  leaderboardRouter,
  matchesRouter,
  usersRouter,
} from './routes/social.js';
import { apiRateLimit } from './middleware/rateLimit.js';
import { registerSocketHandlers } from './sockets/handlers.js';
import { startCleanupCron } from './utils/cron.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const httpServer = createServer(app);

/**
 * Security middleware.
 * Production-grade stack: helmet (security headers), CORS whitelist,
 * JSON body limits, cookie parser.
 */
app.use(
  helmet({
    contentSecurityPolicy: isProduction
      ? {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
            fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
            imgSrc: ["'self'", 'data:', 'blob:'],
            connectSrc: ["'self'", 'wss:', 'ws:'],
          },
        }
      : false,
    crossOriginEmbedderPolicy: false,
  }),
);

const allowedOrigins = env.CORS_ORIGIN.split(',').map((s) => s.trim());
app.use(
  cors({
    origin: allowedOrigins.includes('*') ? true : allowedOrigins,
    credentials: true,
  }),
);

app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());

// Health check (Railway uses this)
app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, uptime: process.uptime() });
  } catch {
    res.status(503).json({ ok: false });
  }
});

// All API routes under /api — rate limited
app.use('/api', apiRateLimit);
app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/friends', friendsRouter);
app.use('/api/leaderboard', leaderboardRouter);
app.use('/api/matches', matchesRouter);

// Serve built frontend (only in production)
if (isProduction) {
  const frontendDist = path.resolve(__dirname, '../public');
  app.use(express.static(frontendDist, { maxAge: '1h', index: false }));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

// Generic error handler
app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
  },
);

// Socket.IO with Redis adapter for horizontal scaling
const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins.includes('*') ? true : allowedOrigins,
    credentials: true,
  },
  pingInterval: 10000,
  pingTimeout: 5000,
});

// Wait for Redis clients before enabling adapter
Promise.all([pubClient.ping(), subClient.ping()])
  .then(() => {
    io.adapter(createAdapter(pubClient, subClient));
    console.info('✅ Socket.IO Redis adapter connected');
  })
  .catch((err) => console.error('Redis adapter setup failed:', err));

registerSocketHandlers(io);

// Cleanup cron
startCleanupCron();

httpServer.listen(env.PORT, () => {
  console.info(`🚀 NEON XO backend listening on :${env.PORT} (${env.NODE_ENV})`);
});

// Graceful shutdown
async function shutdown(signal: string): Promise<void> {
  console.info(`\nReceived ${signal}, shutting down gracefully...`);
  httpServer.close();
  io.close();
  await closePool();
  await closeRedis();
  process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
