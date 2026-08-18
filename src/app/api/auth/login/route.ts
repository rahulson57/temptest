import { ok, parseJson, withApi } from '@/lib/api';
import { authenticate } from '@/server/auth/accounts';
import { loginSchema } from '@/server/auth/schemas';

/**
 * POST /api/auth/login — exchange credentials for a session cookie.
 *
 * 400 no email or no password sent
 * 401 wrong password OR unknown email — deliberately INDISTINGUISHABLE
 * 200 { user } and a session cookie
 *
 * The 401 body is byte-identical for both failure modes (see
 * INVALID_CREDENTIALS_MESSAGE in src/server/auth/accounts.ts). A login form that
 * says "no account with that email" is an account-enumeration oracle: it lets
 * anyone test an email list against your user table for free.
 */
export const POST = withApi(async (request: Request) => {
  const input = await parseJson(request, loginSchema);
  const user = await authenticate(input);
  return ok({ user });
});
