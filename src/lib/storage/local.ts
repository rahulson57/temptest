import { randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { BadRequestError } from '../errors';
import { slugify } from '../slug';
import type { UploadResult } from '../types';
import {
  ALLOWED_IMAGE_MIME_TYPES,
  DEFAULT_MAX_UPLOAD_BYTES,
  type StorageAdapter,
  type StorageConfig,
  type StorageFile,
} from './types';

const EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/avif': '.avif',
};

/**
 * Writes uploads to ./public/uploads so Next serves them statically in dev.
 *
 * Keys are `<yyyy>/<mm>/<uuid>-<slug><ext>`: date-sharded so the directory never
 * grows unbounded, UUID-prefixed so two users uploading "photo.png" cannot
 * collide, and slugified so keys stay readable in logs.
 */
export class LocalDiskAdapter implements StorageAdapter {
  private readonly config: StorageConfig;

  constructor(config?: Partial<StorageConfig>) {
    this.config = {
      uploadDir: config?.uploadDir ?? process.env.UPLOAD_DIR ?? './public/uploads',
      publicPrefix: config?.publicPrefix ?? '/uploads',
      maxBytes: config?.maxBytes ?? DEFAULT_MAX_UPLOAD_BYTES,
      allowedMimeTypes: config?.allowedMimeTypes ?? ALLOWED_IMAGE_MIME_TYPES,
    };
  }

  async put(file: StorageFile): Promise<UploadResult> {
    this.assertAcceptable(file);

    const key = this.buildKey(file);
    const target = this.resolveKey(key);

    await mkdir(resolve(target, '..'), { recursive: true });
    const bytes = Buffer.from(await file.arrayBuffer());

    // Trust the bytes, not the declared size — a client can lie about `size`.
    if (bytes.byteLength > this.config.maxBytes) {
      throw new BadRequestError(`Files must be under ${formatMb(this.config.maxBytes)}`);
    }

    await writeFile(target, bytes);
    return { key, url: this.getUrl(key) };
  }

  async delete(key: string): Promise<void> {
    // `force` makes a missing file a no-op rather than ENOENT.
    await rm(this.resolveKey(key), { force: true });
  }

  getUrl(key: string): string {
    return `${this.config.publicPrefix}/${key.split(sep).join('/')}`;
  }

  private assertAcceptable(file: StorageFile): void {
    if (!file || typeof file.arrayBuffer !== 'function') {
      throw new BadRequestError('No file was uploaded');
    }
    if (!this.config.allowedMimeTypes.includes(file.type)) {
      throw new BadRequestError('Only JPEG, PNG, GIF, WebP and AVIF images are allowed');
    }
    if (file.size > this.config.maxBytes) {
      throw new BadRequestError(`Files must be under ${formatMb(this.config.maxBytes)}`);
    }
  }

  private buildKey(file: StorageFile): string {
    const now = new Date();
    const year = String(now.getUTCFullYear());
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    const ext = EXTENSION_BY_MIME[file.type] ?? sanitizeExtension(file.name);
    const base = slugify(file.name.replace(/\.[^.]+$/, '')).slice(0, 40) || 'upload';
    return `${year}/${month}/${randomUUID()}-${base}${ext}`;
  }

  /**
   * Resolve a key to an absolute path, refusing anything that escapes uploadDir.
   * Without this check a key of `../../src/app/page.tsx` would be an arbitrary
   * file write.
   */
  private resolveKey(key: string): string {
    const root = resolve(this.config.uploadDir);
    const target = resolve(join(root, key));
    if (target !== root && !target.startsWith(root + sep)) {
      throw new BadRequestError('Invalid upload key');
    }
    return target;
  }
}

function sanitizeExtension(name: string): string {
  const ext = extname(name).toLowerCase();
  return /^\.[a-z0-9]{1,5}$/.test(ext) ? ext : '';
}

function formatMb(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))}MB`;
}
