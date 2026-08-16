import { describe, expect, it } from 'vitest';
import { excerptFromHtml, htmlToText, sanitizeStoryHtml } from '@/lib/sanitize';

/**
 * These are the security tests for stored-HTML rendering. Every case below is a
 * real stored-XSS vector — if one starts failing, story bodies are exploitable.
 */
describe('sanitizeStoryHtml — XSS vectors', () => {
  it('strips <script> tags AND their contents', () => {
    const out = sanitizeStoryHtml('<p>hi</p><script>alert("xss")</script>');
    expect(out).not.toContain('script');
    // The payload text must not survive as visible text either.
    expect(out).not.toContain('alert');
    expect(out).toContain('<p>hi</p>');
  });

  it('strips inline event handlers such as onerror=', () => {
    const out = sanitizeStoryHtml('<img src="https://x.test/a.png" onerror="alert(1)" alt="a">');
    expect(out).not.toContain('onerror');
    expect(out).not.toContain('alert');
    expect(out).toContain('src="https://x.test/a.png"');
  });

  it('strips onclick/onload handlers on any element', () => {
    const out = sanitizeStoryHtml('<p onclick="steal()">text</p><div onload="x()">d</div>');
    expect(out).not.toContain('onclick');
    expect(out).not.toContain('onload');
  });

  it('removes javascript: hrefs', () => {
    const out = sanitizeStoryHtml('<a href="javascript:alert(1)">click</a>');
    expect(out).not.toContain('javascript:');
    expect(out).not.toMatch(/href=/);
    // The link text survives; only the dangerous URL is dropped.
    expect(out).toContain('click');
  });

  it('removes obfuscated javascript: hrefs', () => {
    for (const href of ['JaVaScRiPt:alert(1)', ' javascript:alert(1)', 'java\tscript:alert(1)']) {
      const out = sanitizeStoryHtml(`<a href="${href}">x</a>`);
      expect(out.toLowerCase()).not.toContain('javascript:');
    }
  });

  it('rejects data: URIs in images', () => {
    const out = sanitizeStoryHtml(
      '<img src="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==" alt="x">',
    );
    expect(out).not.toContain('data:');
  });

  it('strips <iframe>, <style> and <object>', () => {
    const out = sanitizeStoryHtml(
      '<iframe src="https://evil.test"></iframe><style>body{display:none}</style><object data="x"></object>',
    );
    expect(out).not.toContain('iframe');
    expect(out).not.toContain('style');
    expect(out).not.toContain('object');
    expect(out).not.toContain('display:none');
  });

  it('drops disallowed attributes such as class, id and style', () => {
    const out = sanitizeStoryHtml('<p class="x" id="y" style="color:red">text</p>');
    expect(out).toBe('<p>text</p>');
  });
});

describe('sanitizeStoryHtml — allowlist', () => {
  it('keeps every allowed formatting tag', () => {
    const input =
      '<h1>H1</h1><h2>H2</h2><h3>H3</h3><p>P</p><strong>B</strong><em>I</em>' +
      '<blockquote>Q</blockquote><pre><code>code</code></pre><hr>' +
      '<ul><li>a</li></ul><ol><li>b</li></ol><br>';
    const out = sanitizeStoryHtml(input);
    for (const tag of ['h1', 'h2', 'h3', 'p', 'strong', 'em', 'blockquote', 'pre', 'code', 'ul', 'ol', 'li']) {
      expect(out).toContain(`<${tag}>`);
    }
    expect(out).toContain('<hr');
    expect(out).toContain('<br');
  });

  it('strips tags outside the allowlist but keeps their text', () => {
    const out = sanitizeStoryHtml('<section><h4>Heading</h4><span>kept</span></section>');
    expect(out).not.toContain('<section');
    expect(out).not.toContain('<h4');
    expect(out).not.toContain('<span');
    expect(out).toContain('Heading');
    expect(out).toContain('kept');
  });

  it('forces rel="nofollow noopener" on links', () => {
    const out = sanitizeStoryHtml('<a href="https://example.com">x</a>');
    expect(out).toContain('rel="nofollow noopener"');
  });

  it('overwrites an attacker-supplied rel', () => {
    const out = sanitizeStoryHtml('<a href="https://example.com" rel="dofollow">x</a>');
    expect(out).toContain('rel="nofollow noopener"');
    expect(out).not.toContain('dofollow');
  });

  it('permits target="_blank" but nothing else', () => {
    expect(sanitizeStoryHtml('<a href="https://a.test" target="_blank">x</a>')).toContain(
      'target="_blank"',
    );
    expect(sanitizeStoryHtml('<a href="https://a.test" target="_parent">x</a>')).not.toContain(
      'target=',
    );
  });

  it('allows http, https and mailto links', () => {
    for (const href of ['https://a.test/x', 'http://a.test/x', 'mailto:a@b.test']) {
      expect(sanitizeStoryHtml(`<a href="${href}">x</a>`)).toContain(href);
    }
  });

  it('is idempotent — sanitizing twice changes nothing', () => {
    const once = sanitizeStoryHtml('<p>hi <a href="https://a.test">link</a></p><script>x()</script>');
    expect(sanitizeStoryHtml(once)).toBe(once);
  });

  it('returns empty string for empty or nullish input', () => {
    expect(sanitizeStoryHtml('')).toBe('');
    expect(sanitizeStoryHtml(null)).toBe('');
    expect(sanitizeStoryHtml(undefined)).toBe('');
  });
});

describe('htmlToText / excerptFromHtml', () => {
  it('strips all markup and collapses whitespace', () => {
    expect(htmlToText('<h1>Title</h1>\n<p>Body   text</p>')).toBe('Title Body text');
  });

  it('does not leak script contents into text', () => {
    expect(htmlToText('<p>ok</p><script>alert(1)</script>')).toBe('ok');
  });

  it('decodes basic entities', () => {
    expect(htmlToText('<p>a &amp; b &lt;c&gt;</p>')).toBe('a & b <c>');
  });

  it('truncates long text on a word boundary with an ellipsis', () => {
    const long = `<p>${'word '.repeat(80).trim()}</p>`;
    const excerpt = excerptFromHtml(long, 50);
    expect(excerpt.length).toBeLessThanOrEqual(51);
    expect(excerpt.endsWith('…')).toBe(true);
    expect(excerpt).not.toContain('wor…');
  });

  it('leaves short text unchanged and un-ellipsised', () => {
    expect(excerptFromHtml('<p>short</p>', 50)).toBe('short');
  });
});
