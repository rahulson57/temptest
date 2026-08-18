import { ok, withApi } from '@/lib/api';
import { destroySession } from '@/lib/auth';

/**
 * POST /api/auth/logout — clear the session cookie.
 *
 * Deliberately succeeds when already signed out. Logout is not a mutation that
 * needs authorization: "make sure I am signed out" is always a safe request, and
 * returning 401 to someone whose session just expired would leave a stale cookie
 * in place — the exact opposite of what they asked for.
 *
 * POST rather than GET so a cross-site <img src="/api/auth/logout"> cannot sign
 * a reader out mid-article.
 */
export const POST = withApi(async () => {
  await destroySession();
  return ok({ signedOut: true });
});
