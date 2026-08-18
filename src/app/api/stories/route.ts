import { created, ok, withApi } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { createStory, listOwnStories } from '@/server/stories/service';
import {
  createStorySchema,
  listStoriesQuerySchema,
  parseBody,
  parseQueryParams,
} from '@/server/stories/validation';

/**
 * /api/stories — the author's own collection.
 *
 * Both verbs require a session: this endpoint is the writing desk, not the
 * public feed (Discovery owns /api/feed). Every response is the shared envelope
 * and every list is cursor-paginated with an enforced ceiling.
 */

/** GET /api/stories — the signed-in author's stories, newest edit first. */
export const GET = withApi(async (request: Request) => {
  const viewer = await requireUser();
  const query = parseQueryParams(request, listStoriesQuerySchema);
  return ok(await listOwnStories(viewer, query));
});

/** POST /api/stories — create a draft. */
export const POST = withApi(async (request: Request) => {
  const viewer = await requireUser();
  const input = await parseBody(request, createStorySchema);
  return created(await createStory(viewer, input));
});
