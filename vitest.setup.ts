import { afterAll, beforeEach } from 'vitest';
import { disconnectDatabase, truncateDatabase } from './tests/helpers/db';

/**
 * Per-file test lifecycle.
 *
 * Every test starts from an empty database. Tests therefore never depend on
 * ordering, and a failing test cannot poison the next one. Suites that need
 * data create it explicitly via tests/helpers/factories.ts.
 */

process.env.DATABASE_URL ??= 'file:./test.db';
process.env.SESSION_SECRET ??= 'test-session-secret-not-used-in-production-0123456789';

beforeEach(async () => {
  await truncateDatabase();
});

afterAll(async () => {
  await disconnectDatabase();
});
