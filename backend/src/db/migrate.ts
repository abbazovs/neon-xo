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

async function migrate(): Promise<void> {
  const schemaPath = findSchema();
  const schema = readFileSync(schemaPath, 'utf-8');

  console.info('Running database migrations from', schemaPath);
  try {
    await pool.query(schema);
    console.info('✅ Migrations applied successfully');
  } catch (err) {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  } finally {
    await closePool();
  }
}

migrate();
