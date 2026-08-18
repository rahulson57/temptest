import { ok, withApi } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { unpublishStory } from '@/server/stories/service';

/**
 * POST /api/stories/[id]/unpublish — pull a story back to DRAFT.
 *
 * `publishedAt` is deliberately preserved: it records when the story WAS
 * published. Clearing it would let an unpublish/republish cycle silently
 * rewrite the story's history.
 */

type Context = { params: Promise<{ id: string }> };

export const POST = withApi(async (_request: Request, context: Context) => {
  const viewer = await requireUser();
  const { id } = await context.params;
  return ok(await unpublishStory(viewer, id));
});
