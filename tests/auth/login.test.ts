import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hashPassword } from '@/lib/auth/password';
import { SESSION_COOKIE_NAME, verifySessionToken } from '@/lib/auth/session-token';
import type { PublicUser } from '@/lib/types';
import { testPrisma } from '@tests/helpers/db';
import { KNOWN_PASSWORD, makeUser } from '@tests/helpers/factories';
import { buildRequest, callRoute, createCookieStoreMock, expectOk } from '@tests/helpers/request';

/** See tests/auth/signup.test.ts for why both of these are doubled. */
const cookieStore = createCookieStoreMock();
vi.mock('next/headers', () => ({ cookies: async () => cookieStore }));
vi.mock('@/lib/db', async () => {
  const { testPrisma } = await import('@tests/helpers/db');
  return { prisma: testPrisma, default: testPrisma };
});

const { POST } = await import('@/app/api/auth/login/route');

async function login(body: unknown) {
  const request = await buildRequest('/api/auth/login', { body });
  return callRoute<{ user: PublicUser }>(POST, request);
}

beforeEach(() => {
  cookieStore.clear();
});

describe('POST /api/auth/login — happy path', () => {
  it('accepts correct credentials and issues a session cookie', async () => {
    const user = await makeUser({ email: 'ada@example.com', handle: 'ada' });

    const result = await login({ email: 'ada@example.com', password: KNOWN_PASSWORD });

    expect(result.status).toBe(200);
    expect(expectOk(result).user.handle).toBe('ada');

    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    expect(token).toBeTruthy();
    await expect(verifySessionToken(token)).resolves.toMatchObject({ sub: user.id });
  });

  it('is case-insensitive on the email and tolerates surrounding whitespace', async () => {
    await makeUser({ email: 'ada@example.com', handle: 'ada' });

    const result = await login({ email: '  ADA@Example.com ', password: KNOWN_PASSWORD });

    expect(result.status).toBe(200);
  });

  it('never returns the password hash to the client', async () => {
    const user = await makeUser({ email: 'ada@example.com', handle: 'ada' });

    const result = await login({ email: user.email, password: KNOWN_PASSWORD });

    const serialized = JSON.stringify(result.body);
    expect(serialized).not.toContain('passwordHash');
    expect(serialized).not.toContain(user.passwordHash);
    expect(serialized).not.toContain(KNOWN_PASSWORD);
  });

  it('verifies against a freshly hashed password, not just the fixture hash', async () => {
    // Guards the whole hash→verify round trip rather than one canned constant.
    const passwordHash = await hashPassword('a-different-password');
    await makeUser({ email: 'grace@example.com', handle: 'grace', passwordHash });

    await expect(
      login({ email: 'grace@example.com', password: 'a-different-password' }),
    ).resolves.toMatchObject({ status: 200 });
  });
});

describe('POST /api/auth/login — failures are indistinguishable', () => {
  it('rejects a wrong password with 401', async () => {
    await makeUser({ email: 'ada@example.com', handle: 'ada' });

    const result = await login({ email: 'ada@example.com', password: 'not-the-password' });

    expect(result.status).toBe(401);
    expect(cookieStore.get(SESSION_COOKIE_NAME)).toBeUndefined();
  });

  it('rejects an unknown email with 401', async () => {
    const result = await login({ email: 'nobody@example.com', password: KNOWN_PASSWORD });

    expect(result.status).toBe(401);
    expect(cookieStore.get(SESSION_COOKIE_NAME)).toBeUndefined();
  });

  it('returns an IDENTICAL body for wrong-password and unknown-email', async () => {
    // This is the account-enumeration test. If these two ever diverge — by
    // status, code, message or field detail — an attacker can test an email
    // list against the user table for free.
    await makeUser({ email: 'ada@example.com', handle: 'ada' });

    const wrongPassword = await login({ email: 'ada@example.com', password: 'wrong-password-here' });
    const unknownEmail = await login({ email: 'nobody@example.com', password: 'wrong-password-here' });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(unknownEmail.body).toEqual(wrongPassword.body);

    // And the message must not name the failing half.
    const message = wrongPassword.body.ok === false ? wrongPassword.body.error.message : '';
    expect(message.length).toBeGreaterThan(0);
    expect(message.toLowerCase()).not.toContain('no account');
    expect(message.toLowerCase()).not.toContain('not found');
    expect(message.toLowerCase()).not.toContain('does not exist');
  });
});

describe('POST /api/auth/login — invalid input is 400', () => {
  it('rejects a missing email with 400', async () => {
    const result = await login({ password: KNOWN_PASSWORD });
    expect(result.status).toBe(400);
  });

  it('rejects a missing password with 400', async () => {
    const result = await login({ email: 'ada@example.com' });
    expect(result.status).toBe(400);
  });

  it('does not apply the 8-character signup rule to login', async () => {
    // A short password must fail as CREDENTIALS (401), not as validation (400).
    // A 400 here would tell an attacker "no stored password is this short".
    await makeUser({ email: 'ada@example.com', handle: 'ada' });

    const result = await login({ email: 'ada@example.com', password: 'short' });

    expect(result.status).toBe(401);
  });

  it('rejects an unparseable body with 400 rather than a 500', async () => {
    const request = await buildRequest('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
    });

    expect((await callRoute(POST, request)).status).toBe(400);
  });

  it('creates no user rows on any failed login', async () => {
    await login({ email: 'nobody@example.com', password: KNOWN_PASSWORD });
    expect(await testPrisma.user.count()).toBe(0);
  });
});
