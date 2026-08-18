import { ok, withApi } from '@/lib/api';
import { requireUser } from '@/lib/auth';

/**
 * GET /api/auth/me — the signed-in viewer.
 *
 * The reference AUTHENTICATED-ONLY route: signed out → 401 from requireUser(),
 * never a null user or an empty object. Clients use it to rehydrate session
 * state after a full page load without parsing the httpOnly cookie (they can't).
 *
 * requireUser() re-reads the user row, so a session whose user has since been
 * deleted is a 401 here even though the JWT itself still verifies.
 */
export const GET = withApi(async () => {
  const user = await requireUser();
  return ok({ user });
});
