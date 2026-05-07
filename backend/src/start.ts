// Single-process bootstrap: env diagnostics → run migrations → load the
// server. Replaces the brittle "node migrate.js && node index.js" chain
// because Railway's startCommand handling drops the && step.
//
// Logs go to stderr via writeSync — synchronous, line-flushed, reaches
// the deploy log even on abrupt exit.

import { writeSync } from 'node:fs';

writeSync(2, `[start] node=${process.version} pid=${process.pid}\n`);
writeSync(2, `[start] PORT=${process.env.PORT ?? 'unset'} NODE_ENV=${process.env.NODE_ENV ?? 'unset'}\n`);
writeSync(
  2,
  `[start] DATABASE_URL=${process.env.DATABASE_URL ? 'set(len=' + process.env.DATABASE_URL.length + ')' : 'UNSET'}\n`,
);
writeSync(
  2,
  `[start] REDIS_URL=${process.env.REDIS_URL ? 'set(len=' + process.env.REDIS_URL.length + ')' : 'UNSET'}\n`,
);
writeSync(
  2,
  `[start] JWT_SECRET=${process.env.JWT_SECRET ? 'set(len=' + process.env.JWT_SECRET.length + ')' : 'UNSET'}\n`,
);

process.on('uncaughtException', (err) => {
  writeSync(2, `[start] uncaughtException: ${err?.stack ?? String(err)}\n`);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  writeSync(2, `[start] unhandledRejection: ${String(reason)}\n`);
});

writeSync(2, `[start] running migrations...\n`);
try {
  const { runMigrations } = await import('./db/migrate.js');
  await runMigrations();
  writeSync(2, `[start] migrations OK\n`);
} catch (err) {
  writeSync(2, `[start] migrations FAILED: ${(err as Error)?.stack ?? String(err)}\n`);
  process.exit(1);
}

writeSync(2, `[start] importing index.js (server bootstrap)...\n`);
try {
  await import('./index.js');
  writeSync(2, `[start] index.js evaluated; server should now be listening\n`);
} catch (err) {
  writeSync(2, `[start] index.js import FAILED: ${(err as Error)?.stack ?? String(err)}\n`);
  process.exit(1);
}
