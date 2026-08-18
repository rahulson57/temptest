import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/db';
import { BadRequestError } from '@/lib/errors';
import { storage, type StorageAdapter, type StorageFile } from '@/lib/storage';
import { UploadMediaError } from './errors';

/**
 * Media uploads — the rules an image must satisfy before it is stored.
 *
 * THREE THINGS THIS MODULE GUARANTEES
 *
 * 1. THE CLIENT FILENAME NEVER REACHES DISK. The stored key is a random UUID
 *    plus an extension derived from the ACCEPTED MIME type. A filename is
 *    attacker-controlled input: it can carry `../`, a second extension
 *    (`avatar.png.html`), or simply be guessable, and a guessable key turns a
 *    private draft's cover image into a public one. The original name is kept
 *    nowhere — not in the key, not in the Upload row.
 * 2. TYPE AND SIZE ARE CHECKED BEFORE ANY BYTES ARE WRITTEN, and size is
 *    checked again against the ACTUAL byte length, because `File.size` is a
 *    client-supplied number and a client can lie about it.
 * 3. EVERY STORED OBJECT HAS AN OWNER ROW. The Upload record is what makes a
 *    later "delete everything this user uploaded" possible at all.
 */

/** Exactly the four types the authoring spec allows. */
export const ALLOWED_UPLOAD_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
] as const;

export type AllowedUploadMimeType = (typeof ALLOWED_UPLOAD_MIME_TYPES)[number];

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB

/** Extension by ACCEPTED mime type — never taken from the client filename. */
const EXTENSION_BY_MIME: Record<AllowedUploadMimeType, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

export type Uploader = { id: string };

export type UploadDto = {
  id: string;
  url: string;
  key: string;
  mimeType: string;
  sizeBytes: number;
};

/** Pull the file field out of a multipart body, or fail with a clear 400. */
export function fileFromFormData(form: FormData, field = 'file'): StorageFile {
  const value = form.get(field);
  if (
    value === null ||
    typeof value === 'string' ||
    typeof (value as StorageFile).arrayBuffer !== 'function'
  ) {
    throw new BadRequestError(`Attach an image in the "${field}" field`);
  }
  return value as unknown as StorageFile;
}

/** 415 for a type we don't accept, 413 for anything over the ceiling. */
export function assertAcceptableUpload(file: StorageFile): AllowedUploadMimeType {
  const mimeType = normalizeMimeType(file.type);
  if (!isAllowedMimeType(mimeType)) {
    throw new UploadMediaError(
      'UNSUPPORTED_MEDIA_TYPE',
      'Images must be PNG, JPEG, WebP or GIF',
    );
  }
  if (typeof file.size === 'number' && file.size > MAX_UPLOAD_BYTES) {
    throw new UploadMediaError('PAYLOAD_TOO_LARGE', 'Images must be smaller than 5MB');
  }
  return mimeType;
}

/**
 * Validate, store and record one image.
 *
 * `adapter` is injectable so a test can point the same code at a temp directory
 * instead of ./public/uploads — the alternative is a suite that writes real
 * files into the repo and leaves them there.
 */
export async function createUpload(
  uploader: Uploader,
  file: StorageFile,
  adapter: StorageAdapter = storage,
): Promise<UploadDto> {
  const mimeType = assertAcceptableUpload(file);

  const bytes = Buffer.from(await file.arrayBuffer());
  // Re-check against the real length: `file.size` came from the client.
  if (bytes.byteLength > MAX_UPLOAD_BYTES) {
    throw new UploadMediaError('PAYLOAD_TOO_LARGE', 'Images must be smaller than 5MB');
  }
  if (bytes.byteLength === 0) {
    throw new BadRequestError('That file is empty');
  }

  const stored = await adapter.put({
    // A random, non-guessable name. The adapter derives its key from this, so
    // handing it the client filename here would undo the whole point.
    name: `${randomUUID()}${EXTENSION_BY_MIME[mimeType]}`,
    type: mimeType,
    size: bytes.byteLength,
    arrayBuffer: async () => toArrayBuffer(bytes),
  });

  const row = await prisma.upload.create({
    data: {
      ownerId: uploader.id,
      key: stored.key,
      url: stored.url,
      mimeType,
      sizeBytes: bytes.byteLength,
    },
    select: { id: true, url: true, key: true, mimeType: true, sizeBytes: true },
  });

  return row;
}

function normalizeMimeType(type: string | null | undefined): string {
  if (typeof type !== 'string') return '';
  // Strip any `; charset=…` parameter and normalize case before comparing.
  return type.split(';')[0]!.trim().toLowerCase();
}

function isAllowedMimeType(type: string): type is AllowedUploadMimeType {
  return (ALLOWED_UPLOAD_MIME_TYPES as readonly string[]).includes(type);
}

/** Buffer → a standalone ArrayBuffer (Buffers can be views into a larger pool). */
function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  const copy = new ArrayBuffer(buffer.byteLength);
  new Uint8Array(copy).set(buffer);
  return copy;
}
