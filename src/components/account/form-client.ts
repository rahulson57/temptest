import type { ApiResponse } from '@/lib/api';
import type { FieldErrors } from '@/lib/errors';

/**
 * Form submission for the account forms.
 *
 * Turns the shared envelope into exactly what a form needs: either the data, or
 * a per-field message map plus one summary message. The forms then hand each
 * field's message to <Input error=...>, which wires aria-describedby and
 * aria-invalid for us.
 */

export type SubmitResult<T> =
  | { ok: true; data: T }
  | { ok: false; message: string; fieldErrors: Record<string, string> };

const GENERIC_ERROR = 'Something went wrong. Please try again.';

export async function submitJson<T>(
  path: string,
  method: 'POST' | 'PATCH',
  body: unknown,
): Promise<SubmitResult<T>> {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, message: GENERIC_ERROR, fieldErrors: {} };
  }

  let envelope: ApiResponse<T> | null = null;
  try {
    envelope = (await response.json()) as ApiResponse<T>;
  } catch {
    envelope = null;
  }

  if (envelope && envelope.ok) return { ok: true, data: envelope.data };

  if (envelope && envelope.ok === false) {
    return {
      ok: false,
      message: envelope.error.message,
      fieldErrors: firstMessagePerField(envelope.error.fields),
    };
  }

  return { ok: false, message: GENERIC_ERROR, fieldErrors: {} };
}

/**
 * Collapse `{ email: ['a', 'b'] }` to `{ email: 'a' }`.
 *
 * A field shows ONE message. Stacking three rules under one input is noise —
 * the user fixes the first, resubmits, and sees the next if it still applies.
 */
export function firstMessagePerField(fields: FieldErrors | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [field, messages] of Object.entries(fields ?? {})) {
    const first = messages[0];
    if (first) out[field] = first;
  }
  return out;
}

/**
 * Where to send someone after they sign in.
 *
 * Only same-origin PATHS are honoured. `?next=https://evil.example` would
 * otherwise make the login form an open redirect — a phishing primitive that
 * borrows this site's credibility. `//evil.example` is a protocol-relative URL
 * and is rejected for the same reason.
 */
export function safeNextPath(next: string | null | undefined, fallback = '/'): string {
  if (!next) return fallback;
  if (!next.startsWith('/') || next.startsWith('//')) return fallback;
  return next;
}
