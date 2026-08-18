import { z } from 'zod';
import { parseJson, parseQuery } from '@/lib/api';
import { AppError, isAppError } from '@/lib/errors';
import { pageQuerySchema } from '@/lib/pagination';
import { MAX_TAGS_PER_STORY } from '@/lib/types';
import {
  bodyHtmlSchema,
  imageUrlSchema,
  storyStatusSchema,
  subtitleSchema,
  tagNameSchema,
} from '@/lib/validation/common';

/**
 * Authoring input contracts.
 *
 * Built on the shared primitives in `@/lib/validation/common` so a rule written
 * once (tag name shape, image URL shape, body size ceiling) means the same thing
 * in the editor, the API and every other vertical.
 *
 * WHY A LOCAL TITLE SCHEMA: the shared `titleSchema` caps titles at 140, but the
 * authoring spec caps them at 120. Everything else is reused verbatim.
 *
 * WHY `parseBody()` INSTEAD OF `parseJson()` DIRECTLY: `ValidationError` maps to
 * 422 in `src/lib/errors.ts`, while the authoring spec requires 400 for invalid
 * input. `parseBody` delegates to `parseJson` — same zod schema, same field
 * errors, same JSON-parse handling — and only re-labels the failure as
 * `BAD_REQUEST` so the status is 400. Foundations files are untouched.
 */

export const MAX_TITLE_LENGTH = 120;

/** A publishable title: present, trimmed, at most 120 characters. */
export const storyTitleSchema = z
  .string()
  .trim()
  .min(1, 'Give your story a title')
  .max(MAX_TITLE_LENGTH, `Titles are at most ${MAX_TITLE_LENGTH} characters`);

/**
 * A draft title. Same ceiling, but an empty string is allowed: autosave fires
 * while someone is still deciding what to call the piece, and refusing to save
 * their body text because the title box is empty would lose work. Publishing
 * still requires a real title (see `assertPublishable` in service.ts).
 */
export const draftTitleSchema = z
  .string()
  .trim()
  .max(MAX_TITLE_LENGTH, `Titles are at most ${MAX_TITLE_LENGTH} characters`);

/**
 * Optional subtitle. `''` means "clear it" and becomes null; OMITTED stays
 * `undefined` so a PATCH that never mentions the subtitle does not erase it.
 *
 * This is why the shared `optionalImageUrlSchema` is not reused verbatim below:
 * it collapses undefined to null, which is right for a create and destructive
 * for a partial update.
 */
const optionalSubtitleSchema = subtitleSchema
  .optional()
  .transform((value) => (value === undefined ? undefined : value.length > 0 ? value : null));

/** Optional cover image. Same undefined-vs-null distinction as the subtitle. */
const optionalCoverImageUrlSchema = z
  .union([imageUrlSchema, z.literal('')])
  .optional()
  .transform((value) => (value === undefined ? undefined : value.length > 0 ? value : null));

/**
 * Tag names, capped at MAX_TAGS_PER_STORY.
 *
 * The cap is checked BEFORE de-duplication on purpose: someone who sends six
 * tags gets told they sent too many, rather than silently having the sixth
 * absorbed by a duplicate. Names are lowercased so "React" and "react" are one
 * tag, which is what makes attachment idempotent.
 */
export const tagNamesInputSchema = z
  .array(tagNameSchema)
  .max(MAX_TAGS_PER_STORY, `Use at most ${MAX_TAGS_PER_STORY} tags`)
  .transform((names) => Array.from(new Set(names.map((name) => name.toLowerCase()))));

/** POST /api/stories — create a draft. */
export const createStorySchema = z
  .object({
    title: storyTitleSchema,
    subtitle: optionalSubtitleSchema,
    bodyHtml: bodyHtmlSchema.default(''),
    coverImageUrl: optionalCoverImageUrlSchema,
    tags: tagNamesInputSchema.default([]),
  })
  // `.strict()` is the anti-mass-assignment guard: without it a client could
  // post authorId/status/publishedAt and hope something spreads them into the
  // create call.
  .strict();

/** PATCH /api/stories/[id] — every field optional, but at least one required. */
export const updateStorySchema = z
  .object({
    title: storyTitleSchema.optional(),
    subtitle: optionalSubtitleSchema,
    bodyHtml: bodyHtmlSchema.optional(),
    coverImageUrl: optionalCoverImageUrlSchema,
    tags: tagNamesInputSchema.optional(),
  })
  .strict()
  // An empty PATCH is a client bug, not a no-op worth persisting.
  .refine(
    (value) => Object.values(value).some((field) => field !== undefined),
    'Send at least one field to update',
  );

/** PATCH /api/stories/[id]/autosave — the editor's periodic save. */
export const autosaveStorySchema = z
  .object({
    title: draftTitleSchema.optional(),
    subtitle: optionalSubtitleSchema,
    bodyHtml: bodyHtmlSchema.optional(),
    coverImageUrl: optionalCoverImageUrlSchema,
  })
  .strict();

/** GET /api/stories — the author's own stories, optionally filtered by status. */
export const listStoriesQuerySchema = pageQuerySchema.extend({
  status: storyStatusSchema.optional(),
});

export type CreateStoryInput = z.infer<typeof createStorySchema>;
export type UpdateStoryInput = z.infer<typeof updateStorySchema>;
export type AutosaveStoryInput = z.infer<typeof autosaveStorySchema>;
export type ListStoriesQuery = z.infer<typeof listStoriesQuerySchema>;

/** Re-label a 422 VALIDATION_FAILED as a 400 BAD_REQUEST, preserving fields. */
function asBadRequest(error: unknown): unknown {
  if (isAppError(error) && error.code === 'VALIDATION_FAILED') {
    return new AppError('BAD_REQUEST', error.message, error.fields);
  }
  return error;
}

/**
 * WHY THE SCHEMA IS `ZodTypeAny` AND NOT `ZodSchema<T>`
 *
 * `ZodSchema<T>` is `ZodType<T, ZodTypeDef, T>` — it pins the INPUT type equal
 * to the OUTPUT type. That holds only for schemas with no `.default()`,
 * `.transform()` or `.catch()`, and every schema in this file has at least one:
 * `tags` defaults to `[]`, `subtitle` transforms `''` into null, `limit` has a
 * `.catch()`. Inferring through `ZodSchema<T>` therefore collapses those to
 * `unknown` or fails outright. Constraining on `ZodTypeAny` and returning
 * `z.output<S>` keeps the post-parse type, which is what callers actually get.
 */
type SchemaOutput<S extends z.ZodTypeAny> = z.output<S>;

/** Validate a JSON body with zod. Invalid input becomes a 400 envelope. */
export async function parseBody<S extends z.ZodTypeAny>(
  request: Request,
  schema: S,
): Promise<SchemaOutput<S>> {
  try {
    return (await parseJson(
      request,
      schema as unknown as z.ZodSchema<SchemaOutput<S>>,
    )) as SchemaOutput<S>;
  } catch (error) {
    throw asBadRequest(error);
  }
}

/** Validate query params with zod. Invalid input becomes a 400 envelope. */
export function parseQueryParams<S extends z.ZodTypeAny>(
  request: Request,
  schema: S,
): SchemaOutput<S> {
  try {
    return parseQuery(request, schema as unknown as z.ZodSchema<SchemaOutput<S>>) as SchemaOutput<S>;
  } catch (error) {
    throw asBadRequest(error);
  }
}
