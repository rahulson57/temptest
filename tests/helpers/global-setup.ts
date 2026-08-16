import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Vitest globalSetup — runs ONCE before any suite.
 *
 * Drops prisma/test.db and re-applies every migration, so the test schema is
 * always exactly what a fresh production deploy would get. Never point this at
 * dev.db: it deletes the file it is given.
 */

export const TEST_DATABASE_URL = 'file:./test.db';
const TEST_DB_FILE = resolve(process.cwd(), 'prisma/test.db');

export default async function setup() {
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  process.env.SESSION_SECRET ??= 'test-session-secret-not-used-in-production-0123456789';

  for (const suffix of ['', '-journal', '-wal', '-shm']) {
    rmSync(`${TEST_DB_FILE}${suffix}`, { force: true });
  }

  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
  });
}
