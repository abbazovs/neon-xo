import { cpSync, existsSync, mkdirSync, rmSync, copyFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Copy schema.sql so the built migrate.js can find it
const schemaSrc = resolve(__dirname, '../src/db/schema.sql');
const schemaDst = resolve(__dirname, '../dist/db/schema.sql');
if (existsSync(schemaSrc)) {
  mkdirSync(dirname(schemaDst), { recursive: true });
  copyFileSync(schemaSrc, schemaDst);
  console.info(`✅ Copied schema.sql → ${schemaDst}`);
}

const frontendDist = resolve(__dirname, '../../frontend/dist');
const backendPublic = resolve(__dirname, '../dist/public');

if (!existsSync(frontendDist)) {
  console.warn(`⚠️  Frontend not built at ${frontendDist}. Run "npm --workspace frontend run build" first.`);
  process.exit(0);
}

if (existsSync(backendPublic)) rmSync(backendPublic, { recursive: true, force: true });
mkdirSync(backendPublic, { recursive: true });
cpSync(frontendDist, backendPublic, { recursive: true });
console.info(`✅ Copied frontend build → ${backendPublic}`);
