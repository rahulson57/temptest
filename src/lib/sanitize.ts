import sanitizeHtml from 'sanitize-html';

/**
 * Server-side HTML sanitization.
 *
 * Stored HTML is NEVER trusted. Sanitize on WRITE (so the database only ever
 * holds clean markup) and again BEFORE RENDER (so rows written by an older,
 * buggier, or compromised path can't escape). Both calls are cheap; the
 * belt-and-braces is deliberate.
 *
 * This module is server-only — do not import it into a client component.
 */

/** The complete allowlist. Anything not named here is stripped. */
export const ALLOWED_TAGS = [
  'h1',
  'h2',
  'h3',
  'p',
  'strong',
  'em',
  'a',
  'blockquote',
  'pre',
  'code',
  'img',
  'hr',
  'ul',
  'ol',
  'li',
  'br',
] as const;

export const ALLOWED_ATTRIBUTES: Record<string, string[]> = {
  a: ['href', 'rel', 'target'],
  img: ['src', 'alt'],
};

/** Only these URL schemes may appear in href/src. `javascript:` is absent by design. */
export const ALLOWED_SCHEMES = ['http', 'https', 'mailto'];

const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [...ALLOWED_TAGS],
  allowedAttributes: ALLOWED_ATTRIBUTES,
  allowedSchemes: ALLOWED_SCHEMES,
  allowedSchemesByTag: {
    // Data URIs in <img> are a stored-XSS and payload-bloat vector.
    img: ['http', 'https'],
  },
  allowProtocolRelative: false,
  // Drop the contents of dangerous containers, not just their tags: without
  // this, `<script>alert(1)</script>` would leave `alert(1)` as visible text.
  nonTextTags: ['style', 'script', 'textarea', 'option', 'noscript', 'iframe'],
  transformTags: {
    // Outbound links must not leak referrer-window control or pass link equity.
    a: (tagName, attribs) => {
      const next: Record<string, string> = { ...attribs };
      if (!next.href) {
        delete next.target;
      }
      next.rel = 'nofollow noopener';
      if (next.target && next.target !== '_blank') {
        delete next.target;
      }
      return { tagName, attribs: next };
    },
  },
  disallowedTagsMode: 'discard',
};

/**
 * Sanitize untrusted story HTML down to the allowlist above.
 * Returns '' for null/undefined/non-string input.
 */
export function sanitizeStoryHtml(dirty: string | null | undefined): string {
  if (typeof dirty !== 'string' || dirty.length === 0) return '';
  return sanitizeHtml(dirty, OPTIONS);
}

/** Strip ALL markup, leaving text. Used for excerpts, search text, meta descriptions. */
export function htmlToText(html: string | null | undefined): string {
  if (typeof html !== 'string' || html.length === 0) return '';
  const text = sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} });
  return decodeBasicEntities(text).replace(/\s+/g, ' ').trim();
}

/** Build a plain-text excerpt of at most `maxChars`, cut on a word boundary. */
export function excerptFromHtml(html: string | null | undefined, maxChars = 160): string {
  const text = htmlToText(html);
  if (text.length <= maxChars) return text;
  const clipped = text.slice(0, maxChars);
  const lastSpace = clipped.lastIndexOf(' ');
  return `${(lastSpace > 40 ? clipped.slice(0, lastSpace) : clipped).trimEnd()}…`;
}

function decodeBasicEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

export default sanitizeStoryHtml;
