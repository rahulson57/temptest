# ADR 0001 — Stack

- **Status:** Accepted
- **Date:** 2025-01 (foundations, TASK-002)
- **Deciders:** Coordinator (stack call), Foundations worker (implementation)

## Context

We are building a Medium-style publishing platform: accounts, a rich-text
editor, story reading pages, a feed, tags, comments and a social graph
(follows, claps, bookmarks).

The repository is **greenfield** — there is no existing code, no legacy
database and no prior framework commitment to accommodate. Four feature
verticals will fan out in parallel immediately after this foundation lands, so
the cost of an ambiguous choice is not "we refactor later"; it is "four teams
build four incompatible things in the same week."

That makes the primary criterion **decidedness**, not flexibility. Every
decision below exists to remove a question that would otherwise be answered
four different ways at runtime.

## Decision

### Next.js 15 (App Router) + React 19 + TypeScript strict, Node 22

A publishing platform is read-dominated and SEO-sensitive: stories must render
on the server, fast, with real HTML for crawlers. That rules out a
client-rendered SPA. Next's App Router gives us server components (so a story
page does its data fetching without shipping a client bundle), file-based
routing that four teams can extend without merge conflicts, and route handlers
so the API lives in the same repo and type system as the UI.

Single repo, single deploy, single type-check. A separate API service would buy
independent scaling we do not need and cost us a shared type boundary we do.

`strict: true` plus `noUncheckedIndexedAccess` — a schema this relational is
where nullability bugs live.

### Prisma + SQLite

A typed ORM matters more than the database engine here. The schema is highly
relational (nine models, several composite keys, a self-referencing comment
thread), and Prisma generates types that flow straight into the React
components — a renamed column becomes a compile error in the feed, not a
runtime `undefined`.

SQLite because it is zero-setup: `npm install && npm run db:migrate` works on a
fresh checkout with no Docker, no service, no credentials. For a single-node
reading workload this is genuinely adequate, and migrating to Postgres later is
a datasource change plus a migration re-generation, because no raw SQL leaks
into feature code.

**Trade-off accepted:** SQLite serializes writes. A high-write production
deployment would need Postgres. We are not that yet, and the ORM boundary keeps
the door open.

### Custom email/password auth (bcryptjs + jose), not NextAuth

The requirement is one credential type: email and password. NextAuth is built
for many providers and brings an adapter layer, its own schema opinions and a
callback model we would spend more time configuring than the ~150 lines the
primitives actually take.

Signed JWT in an httpOnly, SameSite=Lax cookie via `jose`, because `jose` runs
on the Edge runtime — that is what lets `src/middleware.ts` verify a session
without a database round-trip. bcryptjs (not native bcrypt) avoids a
node-gyp build step on every contributor's machine.

**Trade-off accepted:** a stateless JWT cannot be revoked server-side before it
expires. Mitigated by a 7-day lifetime and by `getCurrentUser()` re-reading the
user row on every request — a deleted user is signed out immediately, even
though their token is still cryptographically valid.

### Tailwind CSS v3.4, and only Tailwind

One styling system. Not "Tailwind plus a component library", not "Tailwind plus
CSS modules where it gets awkward". A second UI kit is how four verticals end
up with three button styles. Design tokens live in `tailwind.config.ts`, and
the reading-first typography is a documented utility (`prose-measure`,
`story-prose`) rather than a per-page decision.

v3.4 rather than v4: v4's engine was new at decision time and the ecosystem
around PostCSS integration was still settling. Stability over novelty for a
dependency four teams touch daily.

### Tiptap for rich text, stored as HTML, sanitized server-side

Tiptap (ProseMirror) gives a constrained schema, so the editor cannot produce
markup outside our allowlist in the first place. Storing HTML rather than JSON
keeps the read path trivial — the hot path is rendering, not editing.

**The rule that follows from storing HTML:** sanitize with `sanitize-html`
server-side on **write** *and* again **before render**. Sanitizing only on write
means one buggy or compromised write path permanently poisons the database.
Sanitizing only on render means every future read path must remember. Doing
both is cheap and removes the class of bug entirely. Stored HTML is never
trusted.

### zod for validation, one module per feature

Runtime input validation is not optional — TypeScript types are erased at the
network boundary. zod schemas live under `src/lib/validation/`, one module per
feature, all importing shared primitives from `validation/common.ts`, so
"what is a valid handle" has exactly one answer across signup, profile edit and
the API.

### Vitest for unit/integration, Playwright for E2E — one runner each

Vitest shares Vite's transform pipeline, so it reads our TypeScript and path
aliases with no separate build config, and it is fast enough that the DB-backed
integration tests run in the same command as the pure unit tests.

Playwright owns E2E and nothing else. The reason for **one runner per layer** is
mundane and important: with two, every worker has to ask which one their test
belongs in, and half the suite ends up unrunnable in CI. `npm test` runs
everything except E2E; `npm run test:e2e` runs E2E. There is no third option.

## Consequences

- A clean checkout is `npm install && npm run db:migrate && npm run db:seed && npm test`. No services, no secrets.
- The full schema ships in this foundation, so no downstream vertical edits `prisma/**` and no team blocks on another's migration.
- Cross-vertical component contracts are frozen in `src/lib/types.ts` with typed stubs in `src/components/social/`, so Reading can build against Social before Social exists.
- Swapping SQLite for Postgres, or local disk for S3, is confined to one file each (`prisma/schema.prisma`, `src/lib/storage/index.ts`).
- The Edge-runtime constraint is now a permanent rule: `src/middleware.ts` may import `@/lib/auth/session-token`, never `@/lib/auth`.
