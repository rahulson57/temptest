import { describe, expect, it } from 'vitest';
import {
  WORDS_PER_MINUTE,
  countWords,
  countWordsInHtml,
  formatReadingTime,
  readingTimeMinutes,
} from '@/lib/readingTime';

const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(' ');
const para = (n: number) => `<p>${words(n)}</p>`;

describe('countWords', () => {
  it('counts whitespace-delimited words', () => {
    expect(countWords('one two three')).toBe(3);
  });

  it('ignores leading, trailing and repeated whitespace', () => {
    expect(countWords('  one   two  \n three \t')).toBe(3);
  });

  it('returns 0 for empty or nullish input', () => {
    expect(countWords('')).toBe(0);
    expect(countWords('   ')).toBe(0);
    expect(countWords(null)).toBe(0);
    expect(countWords(undefined)).toBe(0);
  });
});

describe('countWordsInHtml', () => {
  it('counts text content, not markup', () => {
    expect(countWordsInHtml('<p><strong>one</strong> two</p>')).toBe(2);
  });

  it('does not count tag names or attribute values', () => {
    expect(countWordsInHtml('<a href="https://example.com/very/long/path">one</a>')).toBe(1);
  });

  it('ignores script contents', () => {
    expect(countWordsInHtml('<p>one two</p><script>three four five</script>')).toBe(2);
  });
});

describe('readingTimeMinutes', () => {
  it('uses 200 wpm', () => {
    expect(WORDS_PER_MINUTE).toBe(200);
    expect(readingTimeMinutes(para(200))).toBe(1);
    expect(readingTimeMinutes(para(400))).toBe(2);
    expect(readingTimeMinutes(para(1000))).toBe(5);
  });

  it('rounds up partial minutes', () => {
    expect(readingTimeMinutes(para(201))).toBe(2);
    expect(readingTimeMinutes(para(399))).toBe(2);
    expect(readingTimeMinutes(para(401))).toBe(3);
  });

  it('floors at 1 minute, including for empty content', () => {
    expect(readingTimeMinutes(para(1))).toBe(1);
    expect(readingTimeMinutes('')).toBe(1);
    expect(readingTimeMinutes('<p></p>')).toBe(1);
    expect(readingTimeMinutes(null)).toBe(1);
    expect(readingTimeMinutes(undefined)).toBe(1);
  });

  it('is unaffected by heavy markup around the same text', () => {
    const plain = para(600);
    const decorated = `<h1>${words(0)}</h1>${'<p><strong>x</strong></p>'.repeat(0)}${plain}`;
    expect(readingTimeMinutes(decorated)).toBe(readingTimeMinutes(plain));
  });
});

describe('formatReadingTime', () => {
  it('formats a human label', () => {
    expect(formatReadingTime(1)).toBe('1 min read');
    expect(formatReadingTime(7)).toBe('7 min read');
  });

  it('never renders a nonsensical value', () => {
    expect(formatReadingTime(0)).toBe('1 min read');
    expect(formatReadingTime(-4)).toBe('1 min read');
    expect(formatReadingTime(Number.NaN)).toBe('1 min read');
  });
});
