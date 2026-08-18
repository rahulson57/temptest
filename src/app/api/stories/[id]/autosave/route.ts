import { ok, withApi } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { autosaveStory } from '@/server/stories/service';
import { autosaveStorySchema, parseBody } from '@/server/stories/validation';

/**
 * PATCH /api/stories/[id]/autosave — the editor's periodic background save.
 *
 * Separate from PATCH /api/stories/[id] for one reason: an autosave must never
 * refuse to persist body text because the title box is still empty. It accepts
 * a looser title and touches no tags, but it is exactly as authorized as any
 * other mutation — session required, ownership required.
 */

type Context = { params: Promise<{ id: string }> };

export const PATCH = withApi(async (request: Request, context: Context) => {
  const viewer = await requireUser();
  const { id } = await context.params;
  const input = await parseBody(request, autosaveStorySchema);
  return ok(await autosaveStory(viewer, id, input));
});
