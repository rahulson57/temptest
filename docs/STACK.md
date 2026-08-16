# STACK — the contract every worker follows

This document is **normative**. If your vertical needs something different from
what is written here, raise it with the coordinator; do not solve it locally.

Rationale for the choices lives in [`docs/adr/0001-stack.md`](./adr/0001-stack.md).
Visual/typographic rules live in [`docs/DESIGN.md`](./DESIGN.md).

---

## 1. Confirmed stack

| Concern | Choice | Notes |
| --- | --- | --- |
| Framework | **Next.js 15**, App Router | Server components by default |
| UI | **React 19** | `'use client'` only where you need state/effects |
| Language | **TypeScript**, `strict` + `noUncheckedIndexedAccess` | |
| Runtime | **Node 22** | |
| ORM / DB | **Prisma 6 + SQLite** | `prisma/dev.db`, tests use `prisma/test.db` |
| Styling | **Tailwind CSS 3.4** | The ONLY styling system. No CSS-in-JS, no second UI kit |
| Auth | **Custom email/password** — bcryptjs + `jose` JWT | httpOnly `session` cookie, SameSite=Lax, 7 days. No NextAuth |
| Rich text | **Tiptap (ProseMirror)** | Stored as HTML, sanitized server-side |
| Sanitization | **sanitize-html** | On write AND before render. Always |
| Validation | **zod** | One schema module per feature in `src/lib/validation/` |
| Unit/integration tests | **Vitest** | The ONLY unit runner |
| E2E tests | **Playwright** | The ONLY E2E runner |

Do not add a competing dependency in any of these rows.

---

## 2. Commands — use exactly these

```bash
npm install          # first run on a clean checkout
npm ci               # thereafter / in CI (respects package-lock.json)

npm run db:migrate   # apply migrations
npm run db:seed      # deterministic, idempotent fixtures (safe to re-run)
npm run db:reset     # drop, re-migrate, re-seed

npm test             # Vitest: unit + integration
npm test -- tests/lib/slug.test.ts       # a single file

npm run test:e2e     # Playwright
npm run typecheck    # tsc --noEmit
npm run lint         # eslint
npm run build        # production build
npm run dev          # dev server on :3000
```

**Clean checkout, start to finish:**

```bash
npm install && npm run db:migrate && npm run db:seed && npm test
```

`.env` is created automatically from `.env.example` by every `db:*`, `dev` and
`test` script (see `prisma/ensure-env.mjs`). You never need to copy it by hand,
and `.env` is gitignored.

Before you submit anything: `npm run typecheck && npm run lint && npm test && npm run build` must all exit 0.

---

## 3. Directory ownership

Each path has exactly ONE owning vertical. **Do not edit files you do not own** —
a conflicting edit blocks everyone. Need a change in someone else's file? Ask the
coordinator.

| Path | Owner |
| --- | --- |
| `package.json`, all root config, `prisma/**`, `src/lib/**`, `src/middleware.ts`, `src/components/ui/**`, `src/components/layout/**`, `tests/helpers/**`, `docs/**`, `README.md` | **Foundations** (locked after this task) |
| `src/app/(auth)/**`, `src/app/api/auth/**`, `src/app/settings/**`, profile pages | **Accounts** |
| `src/app/write/**`, `src/app/api/stories/**`, editor components | **Authoring** |
| `src/app/stories/**`, `src/app/api/comments/**`, reading + comment components | **Reading** |
| `src/app/explore/**`, `src/app/tag/**`, `src/app/api/feed/**`, `src/app/page.tsx` | **Discovery** |
| `src/app/api/social/**`, `src/app/reading-list/**`, `src/components/social/**` | **Social** |

Two paths have **transferring ownership**, already noted in the files themselves:

- `src/app/page.tsx` — Foundations shipped a placeholder; **Discovery** replaces it wholesale.
- `src/components/social/**` — Foundations shipped typed stubs; **Social** replaces the implementations *behind the same props*.

`prisma/**` is closed. The schema below covers every entity for every vertical.
If you believe you need a schema change, that is a coordinator conversation, not
a migration you write.

---

## 4. API route conventions

Every API route follows all six rules. There are no exceptions.

1. **Location** — route handlers live under `src/app/api/<feature>/`.
2. **Envelope** — always return the JSON envelope from `src/lib/api.ts`:
   - success: `{ ok: true, data: T }` via `ok(data)` / `created(data)`
   - failure: `{ ok: false, error: { code, message, fields? } }` via `fail(...)`
   Clients branch on `ok`, never on the status code.
3. **Validate every mutation body** with zod via `parseJson(request, schema)`.
   Query params go through `parseQuery(request, schema)`.
4. **`requireUser()` on every mutation**, plus an **explicit ownership check**
   (`assertOwner(resource.authorId, viewer)`). Authentication is not
   authorization — middleware protects *pages*, not data.
5. **Paginate every list endpoint** with `src/lib/pagination.ts`
   (default 10, max 50, returns `{ items, nextCursor }`).
6. **Wrap the handler in `withApi()`** so thrown `AppError`s become correct
   envelopes and unexpected errors become an opaque 500 instead of a stack trace.

```ts
// src/app/api/stories/route.ts
import { created, ok, parseJson, parseQuery, withApi } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { pageParams, prismaPageArgs, toPage } from '@/lib/pagination';
import { pageQuerySchema } from '@/lib/pagination';
import { prisma } from '@/lib/db';
import { sanitizeStoryHtml } from '@/lib/sanitize';
import { createStorySchema } from '@/lib/validation/story';

export const GET = withApi(async (request: Request) => {
  const params = pageParams(parseQuery(request, pageQuerySchema));
  const rows = await prisma.story.findMany({
    where: { status: 'PUBLISHED' },
    orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
    ...prismaPageArgs(params),
  });
  return ok(toPage(rows, params.limit));
});

export const POST = withApi(async (request: Request) => {
  const viewer = await requireUser();                       // rule 4
  const input = await parseJson(request, createStorySchema); // rule 3
  const story = await prisma.story.create({
    data: { ...input, authorId: viewer.id, bodyHtml: sanitizeStoryHtml(input.bodyHtml) },
  });
  return created(story);                                     // rule 2
});
```

**Never return a raw Prisma `User`** — it carries `passwordHash`. Select with
`PUBLIC_USER_SELECT` from `@/lib/auth`.

---

## 5. Shared primitives — use these, don't rewrite them

| Module | Use it for |
| --- | --- |
| `@/lib/db` | The `prisma` singleton. Never `new PrismaClient()` in feature code |
| `@/lib/api` | `ok` / `created` / `fail` / `withApi` / `parseJson` / `parseQuery` |
| `@/lib/errors` | `UnauthorizedError`, `ForbiddenError`, `NotFoundError`, `ConflictError`, `ValidationError` |
| `@/lib/auth` | `hashPassword`, `verifyPassword`, `createSession`, `readSession`, `destroySession`, `getCurrentUser`, `requireUser`, `assertOwner` |
| `@/lib/auth/session-token` | Edge-safe sign/verify. **The only auth import allowed in middleware** |
| `@/lib/sanitize` | `sanitizeStoryHtml` (write + render), `htmlToText`, `excerptFromHtml` |
| `@/lib/readingTime` | `readingTimeMinutes`, `formatReadingTime` |
| `@/lib/slug` | `slugify`, `uniqueSlug` (handles `-2`, `-3` collisions) |
| `@/lib/pagination` | `pageQuerySchema`, `pageParams`, `prismaPageArgs`, `toPage` |
| `@/lib/validation/common` | Shared zod primitives — build feature schemas on these |
| `@/lib/storage` | The `storage` adapter. Import the interface, never a concrete class |
| `@/lib/types` | View models + the frozen cross-vertical prop contracts |

### Auth import rule (this one bites)

```ts
// src/middleware.ts — Edge runtime
import { verifySessionToken } from '@/lib/auth/session-token';  // ✅
import { requireUser } from '@/lib/auth';                        // ❌ pulls in bcryptjs + Prisma
```

---

## 6. Data model

Nine models, complete for all verticals: `User`, `Story`, `Tag`, `StoryTag`,
`Comment`, `Clap`, `Bookmark`, `Follow`, `TagFollow`, `Upload`. See
`prisma/schema.prisma` — it is commented.

Two caps are enforced in **application validation**, not by the database:

- **Max 5 tags per story** — `MAX_TAGS_PER_STORY`, `tagNamesSchema` / `tagSlugsSchema`
- **Max 50 claps per user per story** — `MAX_CLAPS_PER_USER`

Both live in `@/lib/types`. Import the constant; do not hardcode 5 or 50.

Indexes exist for the feed, profile, tag, comment-thread and reading-list
queries. If you write a query that needs a new index, that is a coordinator
conversation.

**Comments are soft-deleted** (`deletedAt`) so replies stay threaded. Filter
`deletedAt: null` when rendering, or render a tombstone.

---

## 7. Cross-vertical component contracts

Frozen in `src/lib/types.ts`. Foundations ships accessible **disabled stubs** in
`src/components/social/`; Social replaces the implementations behind the
identical props. Reading imports them today and must not need to change later.

```ts
ClapButtonProps      { storyId, initialCount, initialUserCount, maxPerUser }
BookmarkButtonProps  { storyId, initialBookmarked }
FollowButtonProps    { userId, initialFollowing }
FollowTagButtonProps { tagId, initialFollowing }
```

Changing one of these shapes breaks another team's compile. Route it through the
coordinator.

---

## 8. Testing

- **Vitest** (`npm test`) — unit + integration. Specs go in `tests/<feature>/*.test.ts`.
- **Playwright** (`npm run test:e2e`) — E2E only, in `tests/e2e/`. Vitest explicitly excludes that directory.

### Test-tree ownership

The test tree is owned exactly like the source tree. Put your specs in your own
directory — do not add files to another vertical's.

| Path | Owner |
| --- | --- |
| `tests/helpers/**`, `tests/lib/**`, `tests/db/**` | **Foundations** (this task) |
| `tests/stories/**`, `tests/uploads/**` | **Authoring** (TASK-003) |
| `tests/reading/**`, `tests/comments/**` | **Reading** (TASK-004) |
| `tests/feed/**`, `tests/search/**` | **Discovery** (TASK-005) |
| `tests/auth/**`, `tests/social/**`, `tests/profiles/**` | **Accounts + Social** (TASK-006) |
| `tests/e2e/**` | **Integration** (TASK-007) |

Note: the tests for the auth *primitives* (hashing, session sign/verify) live in
`tests/lib/auth-password.test.ts` and `tests/lib/auth-session.test.ts`, because
Foundations owns the primitives. `tests/auth/**` is reserved for TASK-006's
signup / login / logout / protected-route endpoint tests.

The harness in `tests/helpers/` is ready to use:

| Helper | What it does |
| --- | --- |
| `db.ts` | `testPrisma`, `truncateDatabase()`, `tableCounts()` |
| `factories.ts` | `makeUser`, `makeStory`, `makeTag`, `makeComment` — deterministic, override anything |
| `auth.ts` | `sessionTokenFor(user)`, `sessionCookieFor(user)`, `authHeaders(user)`, `expiredSessionCookieFor(user)` |
| `request.ts` | `buildRequest(path, {body, user, query})`, `callRoute(handler, request, ctx)`, `routeContext({slug})`, `expectOk(result)`, `createCookieStoreMock()` |

The database is **truncated before every test** — suites never depend on each
other's data, and never on seed data. Create what you need with factories.

Testing a handler that calls `cookies()` (i.e. anything using `getCurrentUser()`
or `createSession()`)? `next/headers` needs a real Next request context, so mock
it at the top of the file:

```ts
import { createCookieStoreMock } from '@tests/helpers/request';
const cookieStore = createCookieStoreMock();
vi.mock('next/headers', () => ({ cookies: async () => cookieStore }));
// then: cookieStore.set('session', await sessionTokenFor(user));
```

---

## 9. Security rules

1. **Never trust stored HTML.** `sanitizeStoryHtml()` on write *and* before render.
2. **Never return `passwordHash`.** Select with `PUBLIC_USER_SELECT`.
3. **`requireUser()` + ownership check on every mutation.** Middleware guards pages, not data.
4. **Validate every input with zod** at the boundary.
5. **Never log tokens, password hashes or full session cookies.**
6. `SESSION_SECRET` has a dev fallback that **throws in production** — set it for any real deploy.
