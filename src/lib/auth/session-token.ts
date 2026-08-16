import { SignJWT, jwtVerify } from 'jose';

/**
 * Session token primitives — sign and verify only.
 *
 * EDGE-SAFE BY CONSTRUCTION: this module imports nothing from `next/headers`,
 * Prisma or bcryptjs, so `src/middleware.ts` can import it directly. Cookie
 * plumbing lives in ./session.ts, which is Node/route-handler only.
 */

export const SESSION_COOKIE_NAME = 'session';
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days
const ALG = 'HS256';

/** Claims we put in the JWT. Keep this small — it rides on every request. */
export type SessionPayload = {
  /** User id. */
  sub: string;
  email: string;
  handle: string;
};

const DEV_SECRET = 'dev-only-insecure-session-secret-change-me-0123456789';

/**
 * Resolve the signing secret. Refuses to fall back to the dev default in
 * production — an unset SESSION_SECRET there would let anyone forge sessions.
 */
export function getSessionSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('SESSION_SECRET must be set to a strong value in production');
    }
    return new TextEncoder().encode(DEV_SECRET);
  }
  return new TextEncoder().encode(secret);
}

/**
 * Sign a session JWT.
 * @param expiresInSeconds override for tests (e.g. negative to mint an expired token).
 */
export async function signSessionToken(
  payload: SessionPayload,
  expiresInSeconds: number = SESSION_MAX_AGE_SECONDS,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ email: payload.email, handle: payload.handle })
    .setProtectedHeader({ alg: ALG })
    .setSubject(payload.sub)
    .setIssuedAt(now)
    .setExpirationTime(now + expiresInSeconds)
    .sign(getSessionSecret());
}

/**
 * Verify a session JWT.
 * Returns null for anything unusable — missing, malformed, wrong signature, or
 * expired. Callers treat null as "signed out"; there is no error path to leak.
 */
export async function verifySessionToken(
  token: string | null | undefined,
): Promise<SessionPayload | null> {
  if (typeof token !== 'string' || token.length === 0) return null;
  try {
    const { payload } = await jwtVerify(token, getSessionSecret(), { algorithms: [ALG] });
    const sub = payload.sub;
    const email = payload.email;
    const handle = payload.handle;
    if (typeof sub !== 'string' || typeof email !== 'string' || typeof handle !== 'string') {
      return null;
    }
    return { sub, email, handle };
  } catch {
    return null;
  }
}

/** Cookie attributes shared by the route-handler and middleware code paths. */
export function sessionCookieOptions(maxAge: number = SESSION_MAX_AGE_SECONDS) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge,
  };
}
