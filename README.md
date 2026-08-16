# Quill

A publishing platform for long-form writing: accounts, a rich-text editor,
story pages, a feed, tags, comments and a social graph.

Next.js 15 · React 19 · TypeScript · Prisma + SQLite · Tailwind CSS · Vitest · Playwright

---

## Quick start

Requires **Node 22+**. No database server, no Docker, no secrets to obtain.

```bash
npm install
npm run db:migrate
npm run db:seed
npm test
```

Then:

```bash
npm run dev     # http://localhost:3000
```

`.env` is created automatically from `.env.example` on first run — you do not
need to copy it by hand.

### Seeded accounts

The seed is deterministic and idempotent (re-running it changes nothing). All
three users share the password `password123`:

| Email | Handle |
| --- | --- |
| `ada@example.com` | `@ada` |
| `bo@example.com` | `@bo` |
| `cass@example.com` | `@cass` |

Also seeded: 8 published stories, 1 draft, 6 tags, plus follows, claps,
bookmarks and a threaded comment.

---

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Dev server on :3000 |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm run db:migrate` | Apply migrations |
| `npm run db:seed` | Load fixtures (safe to re-run) |
| `npm run db:reset` | Drop, re-migrate, re-seed |
| `npm test` | Vitest — unit + integration |
| `npm test -- tests/auth/session.test.ts` | A single test file |
| `npm run test:e2e` | Playwright E2E |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |

---

## Layout

```
prisma/          schema, migrations, deterministic seed
src/app/         routes (App Router) + global styles
src/components/  ui/ (design system) · layout/ (chrome) · social/ (shared contracts)
src/lib/         db, auth, api envelope, sanitize, slug, pagination, storage, validation, types
src/middleware.ts  protects /write, /reading-list, /settings
tests/           helpers/ (harness) + per-feature suites
docs/            STACK.md (the contract) · DESIGN.md · adr/
```

---

## Contributing

**Read [`docs/STACK.md`](./docs/STACK.md) first.** It is the normative contract:
directory ownership, API route conventions, the shared primitives you must reuse
instead of rewriting, and the security rules.

Two rules worth repeating here:

- **Stored HTML is never trusted.** `sanitizeStoryHtml()` runs on write *and*
  again before render.
- **Every mutation** calls `requireUser()` *and* checks resource ownership.
  Middleware protects pages, not data.

Before submitting: `npm run typecheck && npm run lint && npm test && npm run build`
must all exit 0.

Design decisions and their trade-offs are recorded in
[`docs/adr/0001-stack.md`](./docs/adr/0001-stack.md).
