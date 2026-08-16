import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Vitest globalSetup — runs ONCE before any suite, and tears down after.
 *
 * Creates a database file UNIQUE TO THIS RUN (prisma/test-<pid>.db) and applies
 * every migration to it, so the test schema is always exactly what a fresh
 * production deploy would get.
 *
 * WHY PER-RUN AND NOT A FIXED test.db: this setup deletes its database before
 * migrating. With a single shared file, two concurrent `npm test` runs — a CI
 * acceptance gate racing a developer's local run, or two verticals' suites in
 * parallel — would delete the file out from under each other and fail with
 * "no such table". Keying on the pid makes concurrent runs independent.
 *
 * DATABASE_URL is set here, in the main Vitest process, BEFORE workers are
 * forked, so every worker inherits it (tests/helpers/db.ts reads it).
 */

const DB_FILE = resolve(process.cwd(), `prisma/test-${process.pid}.db`);
export const TEST_DATABASE_URL = `file:./test-${process.pid}.db`;

const SQLITE_SIDECARS = ['', '-journal', '-wal', '-shm'];

function removeDbFiles() {
  for (const suffix of SQLITE_SIDECARS) {
    rmSync(`${DB_FILE}${suffix}`, { force: true });
  }
}

export default async function setup() {
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  process.env.SESSION_SECRET ??= 'test-session-secret-not-used-in-production-0123456789';

  removeDbFiles();

  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
  });

  // Returned teardown runs after the whole suite. It must be returned from the
  // default export — Vitest ignores a named `teardown` export when the file
  // also has a default export, which silently leaves db files behind.
  return async () => {
    removeDbFiles();
  };
}
