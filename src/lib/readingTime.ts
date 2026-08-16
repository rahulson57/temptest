import { htmlToText } from './sanitize';

/** Average adult reading speed for prose, in words per minute. */
export const WORDS_PER_MINUTE = 200;

/** Count words in a plain-text string. Whitespace-delimited, entity-safe. */
export function countWords(text: string | null | undefined): number {
  if (typeof text !== 'string') return 0;
  const trimmed = text.trim();
  if (trimmed.length === 0) return 0;
  return trimmed.split(/\s+/).length;
}

/** Count the words in the *text content* of an HTML document (markup ignored). */
export function countWordsInHtml(html: string | null | undefined): number {
  return countWords(htmlToText(html));
}

/**
 * Reading time in whole minutes at 200 wpm, rounded up, floored at 1.
 *
 * Empty content still reports 1 minute: a story card reading "0 min read"
 * looks broken, and every story takes a nonzero moment to open.
 */
export function readingTimeMinutes(html: string | null | undefined): number {
  const words = countWordsInHtml(html);
  if (words === 0) return 1;
  return Math.max(1, Math.ceil(words / WORDS_PER_MINUTE));
}

/** Human label for UI: "1 min read" / "7 min read". */
export function formatReadingTime(minutes: number): string {
  const safe = Number.isFinite(minutes) ? Math.max(1, Math.round(minutes)) : 1;
  return `${safe} min read`;
}

export default readingTimeMinutes;
