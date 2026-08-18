import { ok, withApi } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { publishStory } from '@/server/stories/service';

/**
 * POST /api/stories/[id]/publish — make a draft public.
 *
 * Idempotent by design: publishing an already-published story succeeds and
 * leaves `publishedAt` untouched (see publishStory), so a double-click or a
 * retried request cannot rewrite when the story went out.
 */

type Context = { params: Promise<{ id: string }> };

export const POST = withApi(async (_request: Request, context: Context) => {
  const viewer = await requireUser();
  const { id } = await context.params;
  return ok(await publishStory(viewer, id));
});
