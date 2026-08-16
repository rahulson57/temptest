import {
  SESSION_COOKIE_NAME,
  signSessionToken,
  type SessionPayload,
} from '@/lib/auth/session-token';

/**
 * Session helpers for tests.
 *
 * Tests sign a REAL token with the real signer — no mocking of the auth layer.
 * If session verification breaks, these helpers break too, which is the point.
 */

export type SessionUserLike = { id: string; email: string; handle: string };

/** Sign a session JWT for a user row (or anything with id/email/handle). */
export async function sessionTokenFor(
  user: SessionUserLike,
  expiresInSeconds?: number,
): Promise<string> {
  const payload: SessionPayload = { sub: user.id, email: user.email, handle: user.handle };
  return expiresInSeconds === undefined
    ? signSessionToken(payload)
    : signSessionToken(payload, expiresInSeconds);
}

/** `session=<jwt>` — drop straight into a Cookie header. */
export async function sessionCookieFor(
  user: SessionUserLike,
  expiresInSeconds?: number,
): Promise<string> {
  const token = await sessionTokenFor(user, expiresInSeconds);
  return `${SESSION_COOKIE_NAME}=${token}`;
}

/** Headers object carrying a signed session for `user`. */
export async function authHeaders(
  user: SessionUserLike,
  extra?: HeadersInit,
): Promise<Headers> {
  const headers = new Headers(extra);
  headers.set('cookie', await sessionCookieFor(user));
  return headers;
}

/** An already-expired cookie, for asserting that expiry is enforced. */
export async function expiredSessionCookieFor(user: SessionUserLike): Promise<string> {
  return sessionCookieFor(user, -60);
}

export { SESSION_COOKIE_NAME };
