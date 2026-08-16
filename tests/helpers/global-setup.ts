import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Vitest globalSetup — runs ONCE before any suite, and tears down after.
 *
 * Creates a database file UNIQUE TO THIS RUN and applies every migration to it,
 * so the test schema is always exactly what a fresh production deploy gets.
 *
 * TWO HARD-WON RULES ENCODED HERE:
 *
 * 1. PER-RUN FILE. This setup deletes its database before migrating. With a
 *    single shared test.db, two concurrent runs — a CI gate racing a local run,
 *    or two verticals' suites in parallel — delete the file out from under each
 *    other and fail with "no such table".
 *
 * 2. ABSOLUTE URL. A relative `file:./x.db` is resolved relative to
 *    prisma/schema.prisma by the Prisma CLI but relative to CWD by other
 *    callers, so the harness and a spawned seed process can silently end up on
 *    DIFFERENT files. An absolute path has exactly one interpretation.
 *
 * The URL is also published as TEST_DATABASE_URL, because @prisma/client loads
 * .env on import and can overwrite process.env.DATABASE_URL with the dev value.
 * TEST_DATABASE_URL is ours alone and nothing else writes it.
 */

const DB_FILE = resolve(process.cwd(), `prisma/test-${process.pid}.db`);

/** Absolute, unambiguous, and immune to .env overwriting DATABASE_URL. */
export const TEST_DATABASE_URL = `file:${DB_FILE}`;

const SQLITE_SIDECARS = ['', '-journal', '-wal', '-shm'];

function removeDbFiles() {
  for (const suffix of SQLITE_SIDECARS) {
    rmSync(`${DB_FILE}${suffix}`, { force: true });
  }
}

export default async function setup() {
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  process.env.TEST_DATABASE_URL = TEST_DATABASE_URL;
  process.env.SESSION_SECRET ??= 'test-session-secret-not-used-in-production-0123456789';

  removeDbFiles();

  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
  });

  // Teardown MUST be returned from the default export — Vitest ignores a named
  // `teardown` export when the file also has a default export, which silently
  // leaves database files behind.
  return async () => {
    removeDbFiles();
  };
}
