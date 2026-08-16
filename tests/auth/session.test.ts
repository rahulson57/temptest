import { describe, expect, it } from 'vitest';
import {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  sessionCookieOptions,
  signSessionToken,
  verifySessionToken,
} from '@/lib/auth/session-token';

const USER = { sub: 'user-1', email: 'ada@example.com', handle: 'ada' };

describe('session token round-trip', () => {
  it('signs and reads back the same claims', async () => {
    const token = await signSessionToken(USER);
    await expect(verifySessionToken(token)).resolves.toEqual(USER);
  });

  it('produces a compact three-part JWT', async () => {
    const token = await signSessionToken(USER);
    expect(token.split('.')).toHaveLength(3);
  });

  it('does not put the password hash or anything unexpected in the payload', async () => {
    const token = await signSessionToken(USER);
    const parts = token.split('.');
    const payload = JSON.parse(Buffer.from(parts[1] as string, 'base64url').toString('utf8'));
    expect(Object.keys(payload).sort()).toEqual(['email', 'exp', 'handle', 'iat', 'sub']);
  });
});

describe('session expiry', () => {
  it('defaults to a 7-day lifetime', async () => {
    expect(SESSION_MAX_AGE_SECONDS).toBe(60 * 60 * 24 * 7);
    const token = await signSessionToken(USER);
    const payload = JSON.parse(
      Buffer.from(token.split('.')[1] as string, 'base64url').toString('utf8'),
    );
    expect(payload.exp - payload.iat).toBe(SESSION_MAX_AGE_SECONDS);
  });

  it('rejects an expired token', async () => {
    const expired = await signSessionToken(USER, -60);
    await expect(verifySessionToken(expired)).resolves.toBeNull();
  });

  it('still accepts a token that is about to expire', async () => {
    const token = await signSessionToken(USER, 30);
    await expect(verifySessionToken(token)).resolves.toEqual(USER);
  });
});

describe('session tampering', () => {
  it('rejects a token signed with a different secret', async () => {
    const original = process.env.SESSION_SECRET;
    process.env.SESSION_SECRET = 'first-secret-value-that-is-long-enough';
    const token = await signSessionToken(USER);

    process.env.SESSION_SECRET = 'second-secret-value-that-is-long-enough';
    await expect(verifySessionToken(token)).resolves.toBeNull();

    process.env.SESSION_SECRET = original;
  });

  it('rejects a token whose payload was edited', async () => {
    const token = await signSessionToken(USER);
    const [header, payload, signature] = token.split('.');
    const forged = JSON.parse(Buffer.from(payload as string, 'base64url').toString('utf8'));
    forged.sub = 'user-999';
    const tamperedPayload = Buffer.from(JSON.stringify(forged)).toString('base64url');

    await expect(verifySessionToken(`${header}.${tamperedPayload}.${signature}`)).resolves.toBeNull();
  });

  it('rejects an unsigned "alg: none" token', async () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({ sub: 'user-1', email: 'a@b.test', handle: 'a', exp: 9_999_999_999 }),
    ).toString('base64url');
    await expect(verifySessionToken(`${header}.${payload}.`)).resolves.toBeNull();
  });

  it('rejects garbage, empty and nullish tokens without throwing', async () => {
    for (const bad of ['', 'not-a-token', 'a.b.c', null, undefined]) {
      await expect(verifySessionToken(bad)).resolves.toBeNull();
    }
  });

  it('rejects a validly-signed token missing required claims', async () => {
    // Signed with the real secret but lacking handle/email.
    const { SignJWT } = await import('jose');
    const secret = new TextEncoder().encode(
      process.env.SESSION_SECRET ?? 'test-session-secret-not-used-in-production-0123456789',
    );
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('user-1')
      .setExpirationTime('1h')
      .sign(secret);
    await expect(verifySessionToken(token)).resolves.toBeNull();
  });
});

describe('session cookie options', () => {
  it('is httpOnly, SameSite=Lax and site-wide', () => {
    const options = sessionCookieOptions();
    expect(options.httpOnly).toBe(true);
    expect(options.sameSite).toBe('lax');
    expect(options.path).toBe('/');
    expect(options.maxAge).toBe(SESSION_MAX_AGE_SECONDS);
  });

  it('uses the cookie name every vertical expects', () => {
    expect(SESSION_COOKIE_NAME).toBe('session');
  });
});
