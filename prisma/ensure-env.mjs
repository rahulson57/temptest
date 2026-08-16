#!/usr/bin/env node
/**
 * Creates a local .env from .env.example when one does not exist yet.
 *
 * Every db, dev and test script funnels through this so a clean checkout can run
 * `npm install && npm run db:migrate && npm run db:seed && npm test` without a
 * manual copy step, while .env itself stays out of git.
 */
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = join(root, '.env');
const examplePath = join(root, '.env.example');

if (!existsSync(envPath)) {
  if (!existsSync(examplePath)) {
    console.error('[ensure-env] .env.example is missing — cannot bootstrap .env');
    process.exit(1);
  }
  copyFileSync(examplePath, envPath);
  console.log('[ensure-env] created .env from .env.example');
}

// LocalDiskAdapter's target directory must exist before the first upload.
mkdirSync(join(root, 'public', 'uploads'), { recursive: true });
