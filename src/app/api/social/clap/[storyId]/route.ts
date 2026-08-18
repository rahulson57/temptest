import { ok, parseJson, withApi } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { clapStory } from '@/server/social/claps';
import { DEFAULT_CLAP_COUNT, clapSchema, parseTargetId } from '@/server/social/schemas';

/**
 * POST /api/social/clap/[storyId] — add claps, accumulating per user per story.
 *
 * 401 signed out · 400 malformed id or a zero/negative/non-integer count
 * 404 no such story · 200 { storyTotal, userCount, maxPerUser, clamped }
 *
 * OVER-CAP REQUESTS SUCCEED. Asking for 900 claps when you have 3 does not 400;
 * it lands you on exactly MAX_CLAPS_PER_USER and returns the clamped totals. A
 * reader hammering the button is expressing enthusiasm, not making an error, and
 * an error at clap 51 would be a worse product than a ceiling they never notice.
 * Zero and negatives ARE rejected — those are bugs or attacks, never intentions.
 *
 * Clapping your own story is allowed on purpose (see src/server/social/claps.ts).
 */

type Context = { params: Promise<{ storyId: string }> };

export const POST = withApi(async (request: Request, context: Context) => {
  const viewer = await requireUser();
  const storyId = parseTargetId((await context.params).storyId, 'storyId');
  const { count } = await parseJson(request, clapSchema);
  return ok(await clapStory(viewer.id, storyId, count ?? DEFAULT_CLAP_COUNT));
});
