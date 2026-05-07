// Diagnostic bootstrap wrapper.
// Logs env state and import progress to stderr (unbuffered, so output
// reaches the deploy log even if the process crashes during import).
// If index.js throws during static import or top-level evaluation,
// the catch reports it instead of dying silently.

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

writeSync(2, `[start] importing index.js...\n`);

try {
  await import('./index.js');
  writeSync(2, `[start] index.js evaluated; server should now be listening\n`);
} catch (err) {
  writeSync(2, `[start] index.js import FAILED: ${(err as Error)?.stack ?? String(err)}\n`);
  process.exit(1);
}
