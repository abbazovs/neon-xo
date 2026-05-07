import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { pool, closePool } from './pool.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function findSchema(): string {
  // Try alongside the built/source file first, then fall back to src/db.
  const candidates = [
    resolve(__dirname, 'schema.sql'),
    resolve(__dirname, '../../src/db/schema.sql'),
    resolve(__dirname, '../../../backend/src/db/schema.sql'),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  throw new Error(`schema.sql not found. Tried: ${candidates.join(', ')}`);
}

/**
 * Runs the schema against the connection pool. Idempotent (CREATE … IF NOT EXISTS).
 * Does NOT close the pool — callers reuse it for the live app.
 */
export async function runMigrations(): Promise<void> {
  const schemaPath = findSchema();
  const schema = readFileSync(schemaPath, 'utf-8');
  console.info('Running database migrations from', schemaPath);
  await pool.query(schema);
  console.info('✅ Migrations applied successfully');
}

// CLI mode: only when the file is invoked directly via `node migrate.js`.
// Imports (e.g. from start.ts) skip this and call runMigrations() themselves.
const isCliInvocation =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith('migrate.js');

if (isCliInvocation) {
  (async () => {
    try {
      await runMigrations();
    } catch (err) {
      console.error('❌ Migration failed:', err);
      process.exit(1);
    } finally {
      await closePool();
    }
  })();
}
