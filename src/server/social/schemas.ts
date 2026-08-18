import { z, type ZodSchema } from 'zod';
import { parseJson } from '@/lib/api';
import { AppError, ValidationError } from '@/lib/errors';
import { cuidSchema } from '@/lib/validation/common';

/**
 * Social-graph schemas.
 *
 * Route params go through `parseTargetId` for the same reason bodies go through
 * `parseBody`: an empty or 10KB `[storyId]` segment should be a clean 400, not a
 * database round-trip or a 500. A malformed URL segment and a failed body schema
 * are both "the caller sent something this route cannot act on" — one status.
 *
 * REVERSES DEC-155, which let bodies keep foundations' 422. This vertical's spec
 * ("zod-validated (400 on bad input)") and the review charter both require 400,
 * and every rejection test here asserts it. The remap lives at this domain
 * boundary rather than in `src/lib`, which is shared with verticals that may
 * legitimately want 422 for a semantically-valid-but-unprocessable body.
 */

/**
 * Parse a JSON body, reporting a failed schema as 400 with its field detail intact.
 *
 * Unparseable JSON already arrives as `BAD_REQUEST` from `parseJson`; only the
 * schema failure needs remapping, and `fields` is carried across verbatim so the
 * envelope still names the offending keys.
 */
export async function parseBody<T>(request: Request, schema: ZodSchema<T>): Promise<T> {
  try {
    return await parseJson(request, schema);
  } catch (error) {
    if (error instanceof ValidationError) {
      throw new AppError('BAD_REQUEST', error.message, error.fields);
    }
    throw error;
  }
}

export const targetIdSchema = cuidSchema;

/**
 * Validate a dynamic route segment (`[userId]`, `[storyId]`, `[tagId]`).
 *
 * `field` names the segment so the failure envelope carries a useful
 * `fields` detail, exactly like a body validation failure would.
 */
export function parseTargetId(value: unknown, field: string): string {
  const result = targetIdSchema.safeParse(value);
  if (!result.success) {
    const messages = result.error.issues.map((issue) => issue.message);
    throw new AppError('BAD_REQUEST', messages[0] ?? 'Invalid id', { [field]: messages });
  }
  return result.data;
}

/**
 * Clap body.
 *
 * `count` is how many claps to ADD in this request. Zero and negatives are
 * rejected (400) — "clap -5 times" is a bug or an attack, never a user
 * intention. There is deliberately no upper bound in the schema: the per-user
 * ceiling (MAX_CLAPS_PER_USER) is applied by CLAMPING in the service, because
 * the spec requires an over-cap request to succeed with clamped totals rather
 * than fail. Absent `count` means a single clap, which is what a plain tap is.
 *
 * `.optional()` + DEFAULT_CLAP_COUNT rather than zod's `.default(1)`: a schema
 * with a default has a different INPUT type from its OUTPUT type, which makes
 * `ZodSchema<T>` (and therefore `parseJson`) infer `count` as possibly
 * undefined. Explicit is cheaper than fighting the inference.
 */
export const DEFAULT_CLAP_COUNT = 1;

export const clapSchema = z.object({
  count: z
    .number({ invalid_type_error: 'Clap count must be a number' })
    .int('Clap count must be a whole number')
    .min(1, 'Clap count must be at least 1')
    .max(Number.MAX_SAFE_INTEGER)
    .optional(),
});

export type ClapInput = z.infer<typeof clapSchema>;
