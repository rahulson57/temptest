import type { PrismaClient } from '@prisma/client';

/**
 * The slice of Prisma the discovery queries actually use.
 *
 * Every query function takes `db` as its LAST argument, defaulting to the
 * `@/lib/db` singleton, so application code never passes it and tests can hand
 * in an instrumented client (see tests/feed/no-n-plus-one.test.ts, which wraps
 * the client in a counting proxy to assert the query count is constant).
 *
 * Narrow on purpose: a structural type accepts a proxy or an extended client,
 * where `PrismaClient` itself would not.
 */
export type FeedDb = Pick<
  PrismaClient,
  'story' | 'clap' | 'comment' | 'follow' | 'tagFollow' | 'tag'
>;
