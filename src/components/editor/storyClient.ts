import type { ApiResponse } from '@/lib/api';
import type { StoryDto } from '@/server/stories/serialize';
import type { UploadDto } from '@/server/uploads/service';

/**
 * The editor's typed fetch layer.
 *
 * Every response is the shared `{ ok, data | error }` envelope, so this module
 * branches on `ok` — never on the HTTP status. That is the whole point of the
 * envelope: the client stays dumb, and a 413 from the upload route and a 400
 * from the story route are handled by the same three lines.
 *
 * Errors surface as a thrown `ApiError` carrying the SERVER's message, because
 * the server is the only party that knows why it said no. Inventing a friendlier
 * client-side message here would mean the user is told "something went wrong"
 * while the server said "Use at most 5 tags".
 */

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

async function unwrap<T>(response: Response): Promise<T> {
  let body: ApiResponse<T> | null = null;
  try {
    body = (await response.json()) as ApiResponse<T>;
  } catch {
    body = null;
  }

  if (body && body.ok) return body.data;

  throw new ApiError(
    response.status,
    body && !body.ok ? body.error.code : 'INTERNAL',
    body && !body.ok ? body.error.message : 'Something went wrong. Please try again.',
  );
}

async function send<T>(url: string, method: string, payload?: unknown): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: payload === undefined ? undefined : { 'content-type': 'application/json' },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  return unwrap<T>(response);
}

export type StoryDraftInput = {
  title: string;
  subtitle?: string;
  bodyHtml?: string;
  coverImageUrl?: string;
  tags?: string[];
};

/** POST /api/stories — first save of a brand-new draft. */
export function createStory(input: StoryDraftInput): Promise<StoryDto> {
  return send<StoryDto>('/api/stories', 'POST', input);
}

/** PATCH /api/stories/[id] — an explicit save (tags included). */
export function updateStory(id: string, input: Partial<StoryDraftInput>): Promise<StoryDto> {
  return send<StoryDto>(`/api/stories/${id}`, 'PATCH', input);
}

/** PATCH /api/stories/[id]/autosave — the background save. Never sends tags. */
export function autosaveStory(
  id: string,
  input: Omit<Partial<StoryDraftInput>, 'tags'>,
): Promise<StoryDto> {
  return send<StoryDto>(`/api/stories/${id}/autosave`, 'PATCH', input);
}

export function publishStory(id: string): Promise<StoryDto> {
  return send<StoryDto>(`/api/stories/${id}/publish`, 'POST');
}

export function unpublishStory(id: string): Promise<StoryDto> {
  return send<StoryDto>(`/api/stories/${id}/unpublish`, 'POST');
}

export function deleteStory(id: string): Promise<{ id: string; deleted: true }> {
  return send<{ id: string; deleted: true }>(`/api/stories/${id}`, 'DELETE');
}

/** POST /api/uploads — one image, multipart. Used for covers and inline images. */
export async function uploadImage(file: File): Promise<UploadDto> {
  const form = new FormData();
  form.set('file', file);
  const response = await fetch('/api/uploads', { method: 'POST', body: form });
  return unwrap<UploadDto>(response);
}

/** The message to show a user for a thrown error, whatever its origin. */
export function messageFor(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return 'Something went wrong. Please try again.';
}
