import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SESSION_COOKIE_NAME } from '@/lib/auth/session-token';
import type { PublicUser } from '@/lib/types';
import { testPrisma } from '@tests/helpers/db';
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

const { PATCH } = await import('@/app/api/profiles/me/route');
const { updateProfile } = await import('@/server/profiles/profiles');

async function signIn(user: { id: string; email: string; handle: string }) {
  cookieStore.set(SESSION_COOKIE_NAME, await sessionTokenFor(user));
}

async function patchProfile(body: unknown) {
  return callRoute<{ user: PublicUser }>(
    PATCH,
    await buildRequest('/api/profiles/me', { method: 'PATCH', body }),
  );
}

beforeEach(() => {
  cookieStore.clear();
});

describe('PATCH /api/profiles/me — editing your own profile', () => {
  it('updates the display name and bio', async () => {
    const user = await makeUser({ handle: 'ada', displayName: 'Ada', bio: null });
    await signIn(user);

    const result = await patchProfile({ displayName: 'Ada Lovelace', bio: 'Writes about engines.' });

    expect(result.status).toBe(200);
    expect(expectOk(result).user).toMatchObject({
      displayName: 'Ada Lovelace',
      bio: 'Writes about engines.',
    });

    const row = await testPrisma.user.findUnique({ where: { id: user.id } });
    expect(row).toMatchObject({ displayName: 'Ada Lovelace', bio: 'Writes about engines.' });
  });

  it('only writes the keys actually present (PATCH, not PUT)', async () => {
    const user = await makeUser({ handle: 'ada', displayName: 'Ada', bio: 'Original bio' });
    await signIn(user);

    await patchProfile({ displayName: 'Ada L' });

    const row = await testPrisma.user.findUnique({ where: { id: user.id } });
    // Omitting `bio` must not wipe it — that is the difference between an
    // absent key and an empty one, and users lose real text when it is fumbled.
    expect(row).toMatchObject({ displayName: 'Ada L', bio: 'Original bio' });
  });

  it('clears the bio when explicitly sent as an empty string', async () => {
    const user = await makeUser({ handle: 'ada', bio: 'Original bio' });
    await signIn(user);

    await patchProfile({ bio: '' });

    expect((await testPrisma.user.findUnique({ where: { id: user.id } }))?.bio).toBeNull();
  });

  it('sets and clears the avatar url', async () => {
    const user = await makeUser({ handle: 'ada' });
    await signIn(user);

    await patchProfile({ avatarUrl: '/uploads/2025/03/ada.png' });
    expect((await testPrisma.user.findUnique({ where: { id: user.id } }))?.avatarUrl).toBe(
      '/uploads/2025/03/ada.png',
    );

    await patchProfile({ avatarUrl: '' });
    expect((await testPrisma.user.findUnique({ where: { id: user.id } }))?.avatarUrl).toBeNull();
  });

  it('never returns the password hash', async () => {
    const user = await makeUser({ handle: 'ada' });
    await signIn(user);

    const result = await patchProfile({ displayName: 'Ada L' });

    expect(JSON.stringify(result.body)).not.toContain('passwordHash');
    expect(JSON.stringify(result.body)).not.toContain(user.passwordHash);
  });
});

describe('PATCH /api/profiles/me — authorization', () => {
  it('rejects a signed-out request with 401 and changes nothing', async () => {
    const user = await makeUser({ handle: 'ada', displayName: 'Ada' });

    const result = await patchProfile({ displayName: 'Hacked' });

    expect(result.status).toBe(401);
    expect((await testPrisma.user.findUnique({ where: { id: user.id } }))?.displayName).toBe('Ada');
  });

  it('CANNOT be aimed at another user by smuggling an id into the body', async () => {
    // The route resolves its target from the session, and the schema is
    // .strict(), so an extra key is a hard 400 rather than a silent ignore.
    const viewer = await makeUser({ handle: 'viewer', displayName: 'Viewer' });
    const victim = await makeUser({ handle: 'victim', displayName: 'Victim' });
    await signIn(viewer);

    const result = await patchProfile({ id: victim.id, userId: victim.id, displayName: 'Owned' });

    expect(result.status).toBe(400);
    expect((await testPrisma.user.findUnique({ where: { id: victim.id } }))?.displayName).toBe(
      'Victim',
    );
    expect((await testPrisma.user.findUnique({ where: { id: viewer.id } }))?.displayName).toBe(
      'Viewer',
    );
  });

  it('updateProfile() refuses to edit a profile the viewer does not own — 403', async () => {
    // The guard that survives someone later adding PATCH /api/profiles/[userId].
    // Authentication is not authorization: the check belongs to the operation,
    // not to the URL that happens to reach it today.
    const viewer = await makeUser({ handle: 'viewer' });
    const victim = await makeUser({ handle: 'victim', displayName: 'Victim' });

    await expect(updateProfile(viewer, victim.id, { displayName: 'Owned' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
      status: 403,
    });

    expect((await testPrisma.user.findUnique({ where: { id: victim.id } }))?.displayName).toBe(
      'Victim',
    );
  });

  it('updateProfile() allows the owner', async () => {
    const viewer = await makeUser({ handle: 'viewer', displayName: 'Viewer' });

    await expect(updateProfile(viewer, viewer.id, { displayName: 'Renamed' })).resolves.toMatchObject(
      { displayName: 'Renamed' },
    );
  });
});

describe('PATCH /api/profiles/me — invalid input is 400', () => {
  it('rejects a bio over 280 characters', async () => {
    const user = await makeUser({ handle: 'ada', bio: 'Original bio' });
    await signIn(user);

    const result = await patchProfile({ bio: 'x'.repeat(281) });

    expect(result.status).toBe(400);
    if (result.body.ok === false) {
      expect(Object.keys(result.body.error.fields ?? {})).toContain('bio');
    }
    expect((await testPrisma.user.findUnique({ where: { id: user.id } }))?.bio).toBe('Original bio');
  });

  it('accepts a bio of exactly 280 characters (the boundary is inclusive)', async () => {
    const user = await makeUser({ handle: 'ada' });
    await signIn(user);

    const result = await patchProfile({ bio: 'x'.repeat(280) });

    expect(result.status).toBe(200);
  });

  it('rejects an empty display name', async () => {
    const user = await makeUser({ handle: 'ada', displayName: 'Ada' });
    await signIn(user);

    const result = await patchProfile({ displayName: '   ' });

    expect(result.status).toBe(400);
    expect((await testPrisma.user.findUnique({ where: { id: user.id } }))?.displayName).toBe('Ada');
  });

  it('rejects a display name over 60 characters', async () => {
    const user = await makeUser({ handle: 'ada' });
    await signIn(user);

    expect((await patchProfile({ displayName: 'x'.repeat(61) })).status).toBe(400);
  });

  it('rejects a javascript: avatar url', async () => {
    const user = await makeUser({ handle: 'ada' });
    await signIn(user);

    const result = await patchProfile({ avatarUrl: 'javascript:alert(1)' });

    expect(result.status).toBe(400);
    expect((await testPrisma.user.findUnique({ where: { id: user.id } }))?.avatarUrl).toBeNull();
  });

  it('rejects an empty patch that would change nothing', async () => {
    const user = await makeUser({ handle: 'ada' });
    await signIn(user);

    expect((await patchProfile({})).status).toBe(400);
  });

  it('refuses to change the handle or email through this route', async () => {
    // Both are identity changes: they invalidate /u/<handle> links and the
    // claims inside live session cookies. They need their own flow.
    const user = await makeUser({ handle: 'ada', email: 'ada@example.com' });
    await signIn(user);

    const result = await patchProfile({ handle: 'newhandle', email: 'new@example.com' });

    expect(result.status).toBe(400);
    const row = await testPrisma.user.findUnique({ where: { id: user.id } });
    expect(row).toMatchObject({ handle: 'ada', email: 'ada@example.com' });
  });

  it('rejects an unparseable body with 400 rather than a 500', async () => {
    const user = await makeUser({ handle: 'ada' });
    await signIn(user);

    const request = await buildRequest('/api/profiles/me', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
    });

    expect((await callRoute(PATCH, request)).status).toBe(400);
  });
});
