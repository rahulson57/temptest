import { beforeEach, describe, expect, it, vi } from 'vitest';
import { testPrisma } from '@tests/helpers/db';
import { makeUser } from '@tests/helpers/factories';
import { buildRequest, callRoute, createCookieStoreMock, expectOk } from '@tests/helpers/request';
import { verifyPassword } from '@/lib/auth/password';
import { SESSION_COOKIE_NAME, verifySessionToken } from '@/lib/auth/session-token';
import type { PublicUser } from '@/lib/types';

/**
 * POST /api/auth/signup
 *
 * Route handlers are invoked directly (see tests/helpers/request.ts). Two things
 * have to be doubled for that to work:
 *
 *  - `next/headers` — cookies() reads request-scoped AsyncLocalStorage that only
 *    exists inside a real Next request. The cookie store double lets
 *    createSession() actually write a cookie we can then verify.
 *  - `@/lib/db` — feature code imports the prisma singleton, which resolves its
 *    URL from .env at import time. Pointing it at testPrisma guarantees the
 *    route and the assertions are looking at the SAME database. Without this a
 *    suite can pass vacuously against rows it never wrote.
 */
const cookieStore = createCookieStoreMock();
vi.mock('next/headers', () => ({ cookies: async () => cookieStore }));
vi.mock('@/lib/db', async () => {
  const { testPrisma } = await import('@tests/helpers/db');
  return { prisma: testPrisma, default: testPrisma };
});

const { POST } = await import('@/app/api/auth/signup/route');

const VALID = {
  email: 'ada@example.com',
  password: 'correct-horse-battery',
  handle: 'ada_l',
  displayName: 'Ada Lovelace',
};

async function signup(body: unknown) {
  const request = await buildRequest('/api/auth/signup', { body });
  return callRoute<{ user: PublicUser }>(POST, request);
}

beforeEach(() => {
  cookieStore.clear();
});

describe('POST /api/auth/signup — happy path', () => {
  it('creates the account, hashes the password and issues a session', async () => {
    const result = await signup(VALID);

    expect(result.status).toBe(201);
    const { user } = expectOk(result);
    expect(user.handle).toBe('ada_l');
    expect(user.displayName).toBe('Ada Lovelace');

    const row = await testPrisma.user.findUnique({ where: { email: VALID.email } });
    expect(row).not.toBeNull();
    // The password must never be recoverable from the row.
    expect(row?.passwordHash).not.toBe(VALID.password);
    expect(row?.passwordHash).not.toContain(VALID.password);
    await expect(verifyPassword(VALID.password, row?.passwordHash ?? '')).resolves.toBe(true);

    // A session cookie was issued and it names the new user.
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    expect(token).toBeTruthy();
    await expect(verifySessionToken(token)).resolves.toMatchObject({
      sub: row?.id,
      handle: 'ada_l',
    });
  });

  it('normalizes email and handle to lower case', async () => {
    const result = await signup({ ...VALID, email: '  Ada@Example.COM ', handle: 'Ada_L' });

    expect(result.status).toBe(201);
    expect(expectOk(result).user.handle).toBe('ada_l');
    expect(await testPrisma.user.findUnique({ where: { email: 'ada@example.com' } })).not.toBeNull();
  });

  it('never echoes the submitted password back in the response body', async () => {
    const result = await signup({ ...VALID, password: 'short' });

    expect(JSON.stringify(result.body)).not.toContain('short');
  });
});

describe('POST /api/auth/signup — duplicates', () => {
  it('rejects a duplicate email with 409 and creates no second row', async () => {
    await makeUser({ email: VALID.email, handle: 'someone_else' });

    const result = await signup(VALID);

    expect(result.status).toBe(409);
    expect(result.body.ok).toBe(false);
    expect(await testPrisma.user.count({ where: { email: VALID.email } })).toBe(1);
  });

  it('rejects a duplicate handle with 409', async () => {
    await makeUser({ email: 'other@example.com', handle: VALID.handle });

    const result = await signup(VALID);

    expect(result.status).toBe(409);
    expect(await testPrisma.user.findUnique({ where: { email: VALID.email } })).toBeNull();
  });

  it('treats a differently-cased duplicate email as a duplicate', async () => {
    await makeUser({ email: VALID.email, handle: 'someone_else' });

    const result = await signup({ ...VALID, email: 'ADA@EXAMPLE.COM' });

    expect(result.status).toBe(409);
  });
});

describe('POST /api/auth/signup — invalid input is 400', () => {
  const cases: { name: string; body: Record<string, unknown>; field: string }[] = [
    { name: 'malformed email', body: { ...VALID, email: 'not-an-email' }, field: 'email' },
    { name: 'missing email', body: { ...VALID, email: undefined }, field: 'email' },
    { name: 'password under 8 characters', body: { ...VALID, password: 'seven77' }, field: 'password' },
    { name: 'handle under 3 characters', body: { ...VALID, handle: 'ab' }, field: 'handle' },
    { name: 'handle over 20 characters', body: { ...VALID, handle: 'a'.repeat(21) }, field: 'handle' },
    { name: 'handle with punctuation', body: { ...VALID, handle: 'ada lovelace!' }, field: 'handle' },
    { name: 'reserved handle', body: { ...VALID, handle: 'settings' }, field: 'handle' },
    { name: 'empty display name', body: { ...VALID, displayName: '   ' }, field: 'displayName' },
  ];

  for (const { name, body, field } of cases) {
    it(`rejects ${name} with 400 naming the field`, async () => {
      const result = await signup(body);

      expect(result.status).toBe(400);
      expect(result.body.ok).toBe(false);
      if (result.body.ok === false) {
        expect(Object.keys(result.body.error.fields ?? {})).toContain(field);
      }
      expect(await testPrisma.user.count()).toBe(0);
    });
  }

  it('rejects an unparseable body with 400 rather than a 500', async () => {
    const request = await buildRequest('/api/auth/signup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
    });
    const result = await callRoute(POST, request);

    expect(result.status).toBe(400);
  });

  it('issues no session cookie when validation fails', async () => {
    await signup({ ...VALID, email: 'nope' });

    expect(cookieStore.get(SESSION_COOKIE_NAME)).toBeUndefined();
  });
});
