import type { NextRequest } from 'next/server';
import { ok, withApi } from '@/lib/api';
import { getCurrentUser } from '@/lib/auth';
import { UnauthorizedError } from '@/lib/errors';
import { parseFeedQuery } from '@/server/feed/validation';
import { globalFeed, personalFeed, trendingFeed } from '@/server/feed/queries';

/**
 * GET /api/feed?scope=personal|global|trending&cursor=&limit=
 *
 * Envelope: { ok: true, data: { scope, fallback, items, nextCursor } }.
 *
 * `scope` defaults to `global` so an unparameterized call is the public feed.
 * `personal` REQUIRES a session and 401s without one — it does not quietly
 * degrade to the global feed, because a client asking for "my" feed and
 * silently getting everyone's is a bug the client needs to see. (The home PAGE
 * does fall back, but it says so in the UI; see `fallback`.)
 *
 * Invalid `scope` or `limit` is a 400, never a clamp: see the note in
 * src/server/feed/validation.ts for why this differs from the page behaviour.
 */
export const GET = withApi(async (request: NextRequest) => {
  const { scope, page } = parseFeedQuery(request);

  if (scope === 'global') return ok(await globalFeed(page));
  if (scope === 'trending') return ok(await trendingFeed(page));

  const viewer = await getCurrentUser();
  if (!viewer) {
    throw new UnauthorizedError('Sign in to see stories from the people you follow');
  }
  return ok(await personalFeed(viewer.id, page));
});

/** Reads cookies and live data — never statically cached. */
export const dynamic = 'force-dynamic';
