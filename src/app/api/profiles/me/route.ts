import { ok, withApi } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { updateProfile } from '@/server/profiles/profiles';
import { parseBody, updateProfileSchema } from '@/server/profiles/schemas';

/**
 * GET/PATCH /api/profiles/me — read and edit the signed-in user's profile.
 *
 * 401 signed out · 400 invalid field (bio over 280 chars, empty display name,
 * or an unknown key) · 200 the updated PublicUser.
 *
 * THE TARGET IS THE SESSION, NEVER THE BODY. `updateProfile` still takes an
 * explicit target id and runs assertOwner() against it — belt and braces. That
 * looks redundant while the route is "/me", but it is the check that survives
 * someone later adding PATCH /api/profiles/[userId]: the authorization lives
 * with the operation, not with the URL that happens to reach it today. The
 * schema is `.strict()`, so a client trying to smuggle `{ id: <someone else> }`
 * gets a 400 rather than being silently ignored.
 *
 * PATCH semantics: only keys PRESENT in the body are written. `{ bio: "" }`
 * clears the bio; omitting `bio` leaves it untouched.
 */
export const GET = withApi(async () => {
  const viewer = await requireUser();
  return ok({ user: viewer });
});

export const PATCH = withApi(async (request: Request) => {
  const viewer = await requireUser();
  const input = await parseBody(request, updateProfileSchema);
  const user = await updateProfile(viewer, viewer.id, input);
  return ok({ user });
});
