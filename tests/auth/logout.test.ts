import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SESSION_COOKIE_NAME } from '@/lib/auth/session-token';
import { makeUser } from '@tests/helpers/factories';
import { sessionTokenFor } from '@tests/helpers/auth';
import { buildRequest, callRoute, createCookieStoreMock, expectOk } from '@tests/helpers/request';

/** See tests/auth/signup.test.ts for why both of these are doubled. */
const cookieStore = createCookieStoreMock();
vi.mock('next/headers', () => ({ cookies: async () => cookieStore }));
vi.mock('@/lib/db', async () => {
  const { testPrisma } = await import('@tests/helpers/db');
  return { prisma: testPrisma, default: testPrisma };
});

const { POST } = await import('@/app/api/auth/logout/route');
const { GET: ME } = await import('@/app/api/auth/me/route');

async function logout() {
  const request = await buildRequest('/api/auth/logout', { method: 'POST' });
  return callRoute<{ signedOut: boolean }>(POST, request);
}

beforeEach(() => {
  cookieStore.clear();
});

describe('POST /api/auth/logout', () => {
  it('clears the session cookie', async () => {
    const user = await makeUser();
    cookieStore.set(SESSION_COOKIE_NAME, await sessionTokenFor(user));
    // Precondition: we are actually signed in, so "cleared" means something.
    expect(cookieStore.get(SESSION_COOKIE_NAME)?.value).toBeTruthy();

    const result = await logout();

    expect(result.status).toBe(200);
    expect(expectOk(result).signedOut).toBe(true);
    expect(cookieStore.get(SESSION_COOKIE_NAME)).toBeUndefined();
  });

  it('leaves the viewer unauthenticated for subsequent requests', async () => {
    const user = await makeUser();
    cookieStore.set(SESSION_COOKIE_NAME, await sessionTokenFor(user));

    // Authenticated before...
    const before = await callRoute(ME, await buildRequest('/api/auth/me'));
    expect(before.status).toBe(200);

    await logout();

    // ...and rejected after. This is the assertion that matters: an emptied
    // cookie jar is only interesting if the auth layer agrees we are signed out.
    const after = await callRoute(ME, await buildRequest('/api/auth/me'));
    expect(after.status).toBe(401);
  });

  it('succeeds when already signed out', async () => {
    // Logout is idempotent on purpose: "make sure I am signed out" is always a
    // safe request, and 401-ing an expired session would leave its cookie behind.
    const result = await logout();

    expect(result.status).toBe(200);
    expect(cookieStore.get(SESSION_COOKIE_NAME)).toBeUndefined();
  });

  it('clears a cookie that no longer verifies', async () => {
    cookieStore.set(SESSION_COOKIE_NAME, 'not-a-real-jwt');

    const result = await logout();

    expect(result.status).toBe(200);
    expect(cookieStore.get(SESSION_COOKIE_NAME)).toBeUndefined();
  });
});
