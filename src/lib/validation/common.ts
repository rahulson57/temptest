import { z } from 'zod';
import { MAX_TAGS_PER_STORY } from '../types';

/**
 * Shared zod primitives.
 *
 * Convention (docs/STACK.md): one schema module per feature under
 * src/lib/validation/ — e.g. validation/story.ts, validation/comment.ts —
 * each importing these primitives so field rules stay identical across
 * signup, profile edit, the editor and the API.
 */

/** Trim first, then validate: " a@b.com " should not fail as "not an email". */
const trimmed = z.string().trim();

export const emailSchema = trimmed
  .min(3, 'Enter an email address')
  .max(254, 'That email address is too long')
  .email('Enter a valid email address')
  .transform((value) => value.toLowerCase());

/**
 * Passwords: length is the only rule that reliably helps. Composition rules
 * push users toward `Password1!` and buy nothing.
 */
export const passwordSchema = z
  .string()
  .min(8, 'Use at least 8 characters')
  .max(200, 'That password is too long');

export const handleSchema = trimmed
  .min(3, 'Handles are at least 3 characters')
  .max(30, 'Handles are at most 30 characters')
  .regex(/^[a-zA-Z0-9_]+$/, 'Use letters, numbers and underscores only')
  .transform((value) => value.toLowerCase())
  .refine((value) => !RESERVED_HANDLES.has(value), 'That handle is reserved');

export const displayNameSchema = trimmed
  .min(1, 'Enter a display name')
  .max(60, 'Display names are at most 60 characters');

export const bioSchema = trimmed.max(280, 'Bios are at most 280 characters');

export const titleSchema = trimmed
  .min(1, 'Give your story a title')
  .max(140, 'Titles are at most 140 characters');

export const subtitleSchema = trimmed.max(200, 'Subtitles are at most 200 characters');

export const slugSchema = trimmed
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Invalid slug');

/** Raw story HTML from the editor. Sanitized separately — never trust this. */
export const bodyHtmlSchema = z.string().max(400_000, 'That story is too long');

export const commentBodySchema = trimmed
  .min(1, 'Write something first')
  .max(4_000, 'Comments are at most 4000 characters');

export const tagNameSchema = trimmed
  .min(1, 'Tag names cannot be empty')
  .max(30, 'Tag names are at most 30 characters');

/** At most 5 tags per story (MAX_TAGS_PER_STORY), de-duplicated. */
export const tagNamesSchema = z
  .array(tagNameSchema)
  .max(MAX_TAGS_PER_STORY, `Use at most ${MAX_TAGS_PER_STORY} tags`)
  .transform((names) => Array.from(new Set(names.map((n) => n.toLowerCase()))))
  .default([]);

export const tagSlugsSchema = z
  .array(slugSchema)
  .max(MAX_TAGS_PER_STORY, `Use at most ${MAX_TAGS_PER_STORY} tags`)
  .transform((slugs) => Array.from(new Set(slugs)))
  .default([]);

export const cuidSchema = trimmed.min(1, 'Missing id').max(64, 'Invalid id');

/** Absolute http(s) URL, or an app-relative path like /uploads/x.png. */
export const imageUrlSchema = trimmed
  .max(2_048)
  .refine(
    (value) => /^https?:\/\//i.test(value) || value.startsWith('/'),
    'Enter an http(s) URL or an uploaded image path',
  );

export const optionalImageUrlSchema = z
  .union([imageUrlSchema, z.literal('')])
  .optional()
  .transform((value) => (value ? value : null));

/** Handles the app owns as routes and must never hand to a user. */
export const RESERVED_HANDLES = new Set([
  'admin',
  'about',
  'api',
  'auth',
  'bookmarks',
  'explore',
  'feed',
  'help',
  'login',
  'logout',
  'me',
  'new',
  'privacy',
  'reading-list',
  'search',
  'settings',
  'signup',
  'static',
  'stories',
  'story',
  'support',
  'tag',
  'tags',
  'terms',
  'uploads',
  'write',
]);

/** Story status as accepted over the wire. */
export const storyStatusSchema = z.enum(['DRAFT', 'PUBLISHED']);
