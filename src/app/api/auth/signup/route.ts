import { created, withApi } from '@/lib/api';
import { registerUser } from '@/server/auth/accounts';
import { parseBody, signupSchema } from '@/server/auth/schemas';

/**
 * POST /api/auth/signup — create an account and sign in.
 *
 * 400 invalid input (bad email, password under 8 characters, bad handle)
 * 409 email or handle already taken
 * 201 { user } and a session cookie
 *
 * The response never echoes the password back, not even on error: the failure
 * envelope carries field MESSAGES, never field VALUES.
 */
export const POST = withApi(async (request: Request) => {
  const input = await parseBody(request, signupSchema);
  const user = await registerUser(input);
  return created({ user });
});
