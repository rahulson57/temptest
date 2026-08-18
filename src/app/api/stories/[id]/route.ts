import { ok, withApi } from '@/lib/api';
import { getCurrentUser, requireUser } from '@/lib/auth';
import { deleteStory, getStory, updateStory } from '@/server/stories/service';
import { parseBody, updateStorySchema } from '@/server/stories/validation';

/**
 * /api/stories/[id] — one story.
 *
 * GET is readable by anyone for a PUBLISHED story and by its author alone for a
 * DRAFT. PATCH and DELETE always require a session AND ownership: a signed-in
 * user editing someone else's story gets 403, never a silent no-op.
 */

type Context = { params: Promise<{ id: string }> };

export const GET = withApi(async (_request: Request, context: Context) => {
  const { id } = await context.params;
  // getCurrentUser (not requireUser): a signed-out reader may fetch a published
  // story. The draft rule is enforced in the service.
  const viewer = await getCurrentUser();
  return ok(await getStory(id, viewer));
});

export const PATCH = withApi(async (request: Request, context: Context) => {
  const viewer = await requireUser();
  const { id } = await context.params;
  const input = await parseBody(request, updateStorySchema);
  return ok(await updateStory(viewer, id, input));
});

export const DELETE = withApi(async (_request: Request, context: Context) => {
  const viewer = await requireUser();
  const { id } = await context.params;
  return ok(await deleteStory(viewer, id));
});
