import type { UploadResult } from '../types';

/**
 * Storage abstraction.
 *
 * Uploads go through this interface so swapping local disk for S3 is a one-line
 * change in src/lib/storage/index.ts and touches no feature code.
 */
export interface StorageAdapter {
  /** Persist a file and return its opaque key plus a servable URL. */
  put(file: StorageFile): Promise<UploadResult>;
  /** Remove a stored object. Idempotent — deleting a missing key is not an error. */
  delete(key: string): Promise<void>;
  /** Resolve a stored key back to a servable URL. */
  getUrl(key: string): string;
}

/**
 * The upload input. A web `File` satisfies this structurally, so route handlers
 * can pass `formData.get('file') as File` straight through.
 */
export interface StorageFile {
  name: string;
  type: string;
  size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export type StorageConfig = {
  /** Filesystem directory for LocalDiskAdapter. Must sit under ./public. */
  uploadDir: string;
  /** URL prefix that maps to uploadDir. */
  publicPrefix: string;
  maxBytes: number;
  allowedMimeTypes: readonly string[];
};

export const DEFAULT_MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB

export const ALLOWED_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/avif',
] as const;
