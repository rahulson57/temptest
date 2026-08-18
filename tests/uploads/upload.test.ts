import { readdir, rm, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { NextRequest } from 'next/server';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/uploads/route';
import { MAX_UPLOAD_BYTES } from '@/server/uploads/service';
import type { UploadDto } from '@/server/uploads/service';
import { testPrisma } from '../helpers/db';
import { makeUser, resetFactoryCounter } from '../helpers/factories';
import { callRoute, expectOk } from '../helpers/request';
import { TEST_UPLOAD_DIR, cookieStore, fakeImage, signIn, signOut, uploadForm } from './helpers';

vi.mock('next/headers', async () => {
  const { cookieStore: jar } = await import('./helpers');
  return { cookies: async () => jar };
});
vi.mock('@/lib/db', async () => {
  const { testPrisma: db } = await import('../helpers/db');
  return { prisma: db, default: db };
});
vi.mock('@/lib/storage', async () => {
  const actual = await vi.importActual<typeof import('@/lib/storage')>('@/lib/storage');
  const { TEST_UPLOAD_DIR: dir } = await import('./helpers');
  return {
    ...actual,
    // The real adapter, pointed somewhere disposable.
    storage: new actual.LocalDiskAdapter({ uploadDir: dir, publicPrefix: '/uploads' }),
  };
});

/**
 * POST /api/uploads.
 *
 * Four contract points, each with its own failure mode:
 *   200/201 — the bytes land on disk AND an Upload row records the owner.
 *   401     — checked before the body is read, so an anonymous caller cannot
 *             make the server buffer a 50MB payload.
 *   413     — the size ceiling, enforced against the REAL byte length and not
 *             just the client-declared `File.size`.
 *   415     — the type allowlist. An SVG is the interesting case: it is an
 *             image to a user and a script host to a browser.
 */
describe('POST /api/uploads', () => {
  beforeEach(() => {
    resetFactoryCounter();
    cookieStore.clear();
  });

  afterAll(async () => {
    await rm(TEST_UPLOAD_DIR, { recursive: true, force: true });
  });

  async function upload(form: FormData) {
    const request = new NextRequest(new URL('http://localhost:3000/api/uploads'), {
      method: 'POST',
      body: form,
    });
    return callRoute<UploadDto>(POST, request);
  }

  describe('happy path', () => {
    it.each([
      ['image/png', 'shot.png', '.png'],
      ['image/jpeg', 'photo.jpg', '.jpg'],
      ['image/webp', 'modern.webp', '.webp'],
      ['image/gif', 'loop.gif', '.gif'],
    ])('accepts %s and returns a url', async (type, name, extension) => {
      const user = await makeUser();
      await signIn(user);

      const result = await upload(uploadForm(fakeImage(name, type, 2048)));

      expect(result.status).toBe(201);
      const dto = expectOk(result);
      expect(dto.url).toMatch(/^\/uploads\//);
      expect(dto.url.endsWith(extension)).toBe(true);
      expect(dto.mimeType).toBe(type);
      expect(dto.sizeBytes).toBe(2048);

      // The bytes are really on disk, at the key we were handed.
      const written = await stat(resolve(TEST_UPLOAD_DIR, dto.key));
      expect(written.size).toBe(2048);
    });

    it('records an Upload row owned by the caller', async () => {
      const user = await makeUser();
      await signIn(user);

      const dto = expectOk(await upload(uploadForm(fakeImage('a.png', 'image/png', 128))));

      const rows = await testPrisma.upload.findMany();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        id: dto.id,
        ownerId: user.id,
        key: dto.key,
        url: dto.url,
        mimeType: 'image/png',
        sizeBytes: 128,
      });
    });

    it('never uses the client filename as the storage key', async () => {
      const user = await makeUser();
      await signIn(user);

      const dto = expectOk(
        await upload(uploadForm(fakeImage('../../etc/passwd.png', 'image/png', 64))),
      );

      // No path traversal, and nothing recognisable from the submitted name.
      expect(dto.key).not.toContain('..');
      expect(dto.key).not.toContain('passwd');
      expect(dto.url).not.toContain('passwd');

      const files = await readdir(TEST_UPLOAD_DIR, { recursive: true });
      expect(files.some((file) => String(file).includes('passwd'))).toBe(false);
    });

    it('gives two uploads of the same filename different, non-guessable keys', async () => {
      const user = await makeUser();
      await signIn(user);

      const first = expectOk(await upload(uploadForm(fakeImage('photo.png', 'image/png', 32))));
      const second = expectOk(await upload(uploadForm(fakeImage('photo.png', 'image/png', 32))));

      expect(first.key).not.toBe(second.key);
      // A UUID's worth of entropy, not a counter someone can walk.
      expect(first.key).toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/);
    });

    it('accepts a content-type carrying a charset parameter', async () => {
      const user = await makeUser();
      await signIn(user);

      const result = await upload(uploadForm(fakeImage('a.png', 'image/png; charset=binary', 64)));

      expect(result.status).toBe(201);
      expect(expectOk(result).mimeType).toBe('image/png');
    });
  });

  describe('unauthenticated', () => {
    it('returns 401 and stores nothing', async () => {
      signOut();

      const result = await upload(uploadForm(fakeImage('a.png', 'image/png', 128)));

      expect(result.status).toBe(401);
      expect(result.body).toMatchObject({ ok: false, error: { code: 'UNAUTHORIZED' } });
      expect(await testPrisma.upload.count()).toBe(0);
    });

    it('returns 401 for an oversize anonymous upload too — auth is checked first', async () => {
      signOut();

      const result = await upload(
        uploadForm(fakeImage('huge.png', 'image/png', MAX_UPLOAD_BYTES + 1)),
      );

      expect(result.status).toBe(401);
      expect(await testPrisma.upload.count()).toBe(0);
    });
  });

  describe('oversize', () => {
    it('returns 413 for a file over 5MB and stores nothing', async () => {
      const user = await makeUser();
      await signIn(user);

      const result = await upload(
        uploadForm(fakeImage('huge.png', 'image/png', MAX_UPLOAD_BYTES + 1)),
      );

      expect(result.status).toBe(413);
      expect(result.body).toMatchObject({
        ok: false,
        error: { code: 'PAYLOAD_TOO_LARGE' },
      });
      expect(await testPrisma.upload.count()).toBe(0);
    });

    it('accepts a file exactly at the 5MB ceiling', async () => {
      const user = await makeUser();
      await signIn(user);

      const result = await upload(uploadForm(fakeImage('big.png', 'image/png', MAX_UPLOAD_BYTES)));

      expect(result.status).toBe(201);
      expect(expectOk(result).sizeBytes).toBe(MAX_UPLOAD_BYTES);
    });
  });

  describe('unsupported media type', () => {
    it.each([
      ['application/pdf', 'doc.pdf'],
      ['text/html', 'page.html'],
      ['image/svg+xml', 'vector.svg'],
      ['application/octet-stream', 'blob.bin'],
      ['', 'unknown'],
    ])('returns 415 for %s', async (type, name) => {
      const user = await makeUser();
      await signIn(user);

      const result = await upload(uploadForm(fakeImage(name, type, 512)));

      expect(result.status).toBe(415);
      expect(result.body).toMatchObject({
        ok: false,
        error: { code: 'UNSUPPORTED_MEDIA_TYPE' },
      });
      expect(await testPrisma.upload.count()).toBe(0);
    });

    it('does not accept a disallowed type just because the name ends in .png', async () => {
      const user = await makeUser();
      await signIn(user);

      const result = await upload(uploadForm(fakeImage('trojan.png', 'text/html', 512)));

      expect(result.status).toBe(415);
      expect(await testPrisma.upload.count()).toBe(0);
    });
  });

  describe('malformed requests', () => {
    it('returns 400 when no file field is present', async () => {
      const user = await makeUser();
      await signIn(user);

      const result = await upload(new FormData());

      expect(result.status).toBe(400);
      expect(await testPrisma.upload.count()).toBe(0);
    });

    it('returns 400 when the file field is a plain string', async () => {
      const user = await makeUser();
      await signIn(user);

      const form = new FormData();
      form.set('file', 'not-a-file');

      expect((await upload(form)).status).toBe(400);
    });

    it('returns 400 for an empty file', async () => {
      const user = await makeUser();
      await signIn(user);

      const result = await upload(uploadForm(fakeImage('empty.png', 'image/png', 0)));

      expect(result.status).toBe(400);
      expect(await testPrisma.upload.count()).toBe(0);
    });
  });
});
