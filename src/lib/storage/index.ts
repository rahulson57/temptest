import { LocalDiskAdapter } from './local';
import type { StorageAdapter } from './types';

export type { StorageAdapter, StorageFile, StorageConfig } from './types';
export { ALLOWED_IMAGE_MIME_TYPES, DEFAULT_MAX_UPLOAD_BYTES } from './types';
export { LocalDiskAdapter } from './local';

/**
 * The active storage adapter.
 *
 * S3 ADAPTER SLOT
 * ---------------
 * To move uploads to object storage, add `src/lib/storage/s3.ts` exporting an
 * `S3Adapter implements StorageAdapter` (put/delete/getUrl), then switch on an
 * env var here:
 *
 *   export const storage: StorageAdapter =
 *     process.env.STORAGE_DRIVER === 's3' ? new S3Adapter() : new LocalDiskAdapter();
 *
 * Nothing outside this file should reference a concrete adapter class —
 * feature code imports `storage` (or the StorageAdapter type) only.
 */
export const storage: StorageAdapter = new LocalDiskAdapter();

export default storage;
