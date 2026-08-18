import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/stories/route';
import { PATCH } from '@/app/api/stories/[id]/route';
import { PATCH as AUTOSAVE } from '@/app/api/stories/[id]/autosave/route';
import type { StoryDto } from '@/server/stories/serialize';
import { testPrisma } from '../helpers/db';
import { makeUser, resetFactoryCounter } from '../helpers/factories';
import { buildRequest, callRoute, expectOk, routeContext } from '../helpers/request';
import { cookieStore, signIn } from './helpers';

vi.mock('next/headers', async () => {
  const { cookieStore: jar } = await import('./helpers');
  return { cookies: async () => jar };
});
vi.mock('@/lib/db', async () => {
  const { testPrisma: db } = await import('../helpers/db');
  return { prisma: db, default: db };
});

/**
 * Stored XSS: sanitization happens ON WRITE, on every path.
 *
 * WHY ASSERT ON THE DATABASE ROW, NOT THE RESPONSE. Sanitizing before render is
 * the second line of defence and Reading owns it. This file is about the first:
 * the byte sequence `<script>` must never REACH the `Story.bodyHtml` column. If
 * it does, then every present and future consumer of that column — the story
 * page, an RSS feed, a search index, an email digest, a mobile client — has to
 * remember to sanitize, and the first one that forgets is a live XSS.
 *
 * Every write path is covered: create, update and autosave. A payload blocked
 * on create but waved through on autosave is not blocked at all — the editor
 * autosaves every two seconds.
 */

const XSS_PAYLOAD = [
  '<p>Legitimate opening paragraph.</p>',
  '<script>alert(1)</script>',
  '<img src="/uploads/ok.png" onerror="alert(2)" alt="A diagram">',
  '<a href="javascript:alert(3)">click me</a>',
  '<iframe src="https://evil.example/frame"></iframe>',
  '<p onclick="alert(4)">Paragraph with a handler.</p>',
  '<style>body{display:none}</style>',
  '<img src="data:text/html;base64,PHNjcmlwdD5hbGVydCg1KTwvc2NyaXB0Pg==" alt="data uri">',
  '<p>Legitimate closing paragraph.</p>',
].join('');

/** Every substring that must not survive into the column. */
function assertClean(bodyHtml: string): void {
  expect(bodyHtml).not.toContain('<script');
  expect(bodyHtml).not.toContain('</script');
  expect(bodyHtml).not.toContain('onerror');
  expect(bodyHtml).not.toContain('onclick');
  expect(bodyHtml).not.toContain('javascript:');
  expect(bodyHtml).not.toContain('<iframe');
  expect(bodyHtml).not.toContain('<style');
  expect(bodyHtml).not.toContain('data:text/html');
  // nonTextTags: the tag AND its contents go, so `alert(1)` cannot survive as
  // visible text either.
  expect(bodyHtml).not.toContain('alert(1)');
  expect(bodyHtml).not.toContain('alert(5)');
  expect(bodyHtml).not.toContain('display:none');
}

describe('sanitization on write', () => {
  beforeEach(async () => {
    resetFactoryCounter();
    cookieStore.clear();
  });

  it('strips script tags and event-handler attributes on CREATE', async () => {
    const author = await makeUser();
    await signIn(author);

    const story = expectOk(
      await callRoute<StoryDto>(
        POST,
        await buildRequest('/api/stories', {
          method: 'POST',
          body: { title: 'XSS attempt', bodyHtml: XSS_PAYLOAD },
        }),
      ),
    );

    const persisted = await testPrisma.story.findUnique({ where: { id: story.id } });
    expect(persisted).not.toBeNull();
    assertClean(persisted!.bodyHtml);
    assertClean(story.bodyHtml);

    // Legitimate content survives — this is sanitization, not deletion.
    expect(persisted!.bodyHtml).toContain('Legitimate opening paragraph.');
    expect(persisted!.bodyHtml).toContain('Legitimate closing paragraph.');
    expect(persisted!.bodyHtml).toContain('<img');
    expect(persisted!.bodyHtml).toContain('/uploads/ok.png');
    expect(persisted!.bodyHtml).toContain('alt="A diagram"');
  });

  it('strips the same payload on UPDATE', async () => {
    const author = await makeUser();
    await signIn(author);

    const story = expectOk(
      await callRoute<StoryDto>(
        POST,
        await buildRequest('/api/stories', {
          method: 'POST',
          body: { title: 'Clean to start', bodyHtml: '<p>Clean.</p>' },
        }),
      ),
    );

    await callRoute<StoryDto>(
      PATCH,
      await buildRequest(`/api/stories/${story.id}`, {
        method: 'PATCH',
        body: { bodyHtml: XSS_PAYLOAD },
      }),
      routeContext({ id: story.id }),
    );

    const persisted = await testPrisma.story.findUnique({ where: { id: story.id } });
    assertClean(persisted!.bodyHtml);
  });

  it('strips the same payload on AUTOSAVE', async () => {
    const author = await makeUser();
    await signIn(author);

    const story = expectOk(
      await callRoute<StoryDto>(
        POST,
        await buildRequest('/api/stories', {
          method: 'POST',
          body: { title: 'Clean to start', bodyHtml: '<p>Clean.</p>' },
        }),
      ),
    );

    await callRoute<StoryDto>(
      AUTOSAVE,
      await buildRequest(`/api/stories/${story.id}/autosave`, {
        method: 'PATCH',
        body: { bodyHtml: XSS_PAYLOAD },
      }),
      routeContext({ id: story.id }),
    );

    const persisted = await testPrisma.story.findUnique({ where: { id: story.id } });
    assertClean(persisted!.bodyHtml);
  });

  it('leaves no story row in the database holding a script tag', async () => {
    const author = await makeUser();
    await signIn(author);

    for (const body of [XSS_PAYLOAD, '<script>alert(1)</script>', '<p>fine</p>']) {
      await callRoute<StoryDto>(
        POST,
        await buildRequest('/api/stories', {
          method: 'POST',
          body: { title: `Attempt ${body.length}`, bodyHtml: body },
        }),
      );
    }

    const stories = await testPrisma.story.findMany({ select: { bodyHtml: true } });
    // Non-empty precondition first: "every row is clean" is trivially true of
    // zero rows, and that is exactly the vacuous test that hides a broken write.
    expect(stories.length).toBeGreaterThan(0);
    expect(stories).toHaveLength(3);
    for (const story of stories) assertClean(story.bodyHtml);
  });

  it('recomputes reading time from the SANITIZED body, not the raw input', async () => {
    const author = await makeUser();
    await signIn(author);

    // 5000 words of script content that is stripped entirely: if reading time
    // were computed before sanitization, this would claim ~25 minutes.
    const padded = `<script>${'word '.repeat(5000)}</script><p>Four words go here.</p>`;

    const story = expectOk(
      await callRoute<StoryDto>(
        POST,
        await buildRequest('/api/stories', {
          method: 'POST',
          body: { title: 'Padded', bodyHtml: padded },
        }),
      ),
    );

    expect(story.readingTimeMinutes).toBe(1);
  });

  it('keeps every element the editor toolbar can produce', async () => {
    const author = await makeUser();
    await signIn(author);

    const editorOutput = [
      '<h1>Heading one</h1>',
      '<h2>Heading two</h2>',
      '<p><strong>bold</strong> and <em>italic</em></p>',
      '<blockquote><p>A quotation.</p></blockquote>',
      '<pre><code>const x = 1;</code></pre>',
      '<ul><li>bullet</li></ul>',
      '<ol><li>ordered</li></ol>',
      '<hr>',
      '<img src="/uploads/2026/01/pic.png" alt="A picture">',
      '<p><a href="https://example.com">a link</a></p>',
    ].join('');

    const story = expectOk(
      await callRoute<StoryDto>(
        POST,
        await buildRequest('/api/stories', {
          method: 'POST',
          body: { title: 'Everything', bodyHtml: editorOutput },
        }),
      ),
    );

    for (const tag of ['<h1', '<h2', '<strong', '<em', '<blockquote', '<pre', '<code', '<ul', '<ol', '<li', '<hr', '<img', '<a ']) {
      expect(story.bodyHtml).toContain(tag);
    }
    // Outbound links are defanged on the way in.
    expect(story.bodyHtml).toContain('rel="nofollow noopener"');
  });
});
