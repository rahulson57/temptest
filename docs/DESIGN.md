# DESIGN — reading-first system

Tailwind is the only styling system (see `docs/STACK.md`). This document is the
short version of *how* to use it so five verticals produce one product.

## Principle

The product is a reading surface. Everything that is not the story is chrome,
and chrome should be quiet: neutral colours, sans-serif, small. The story itself
is serif, large, and generously spaced.

If a design decision is ambiguous, favour the one that makes a 2,000-word essay
more pleasant to read at 11pm.

## Tokens

Colours are CSS custom properties (`src/app/globals.css`) exposed as Tailwind
colours, so `bg-canvas/80` and dark mode both work. Never hardcode a hex value.

| Token | Use |
| --- | --- |
| `canvas` | Page background |
| `surface` | Raised/inset panels, code blocks, chips |
| `border` | Hairlines, dividers, input borders |
| `ink` | Primary text |
| `ink-muted` | Secondary text, bylines |
| `ink-subtle` | Tertiary — timestamps, counts, placeholders |
| `accent` | Interactive affordance + focus ring. Used sparingly |
| `accent-ink` | Text on an accent background |
| `danger` | Destructive actions, validation errors |

Dark mode follows `prefers-color-scheme` and needs no per-component work — it is
purely a token swap.

## Typography

| Class | Use |
| --- | --- |
| `font-serif` | Story titles and body text |
| `font-sans` | Everything else (default on `body`) |
| `prose-measure` | ~65ch centred reading column |
| `story-prose` | Full typographic treatment for sanitized story HTML |
| `leading-reading` | 1.75 line-height for long-form passages |
| `text-story` | 1.25rem/1.75 body size |

Rendering a story body is exactly this:

```tsx
<div
  className="prose-measure story-prose"
  dangerouslySetInnerHTML={{ __html: sanitizeStoryHtml(story.bodyHtml) }}
/>
```

The `sanitizeStoryHtml()` call is **not optional**, even though the value was
sanitized on write. See `docs/STACK.md` §9.

## Components

Reuse before you restyle. `src/components/ui/`:

`Button` / `ButtonLink`, `Input`, `Textarea`, `Avatar`, `Tag` / `TagList`,
`StoryCard`, `EmptyState`, `Pagination`.
`src/components/layout/`: `SiteHeader`, `SiteFooter`, `Container`.

- `Container` has two widths: `reading` (65ch) and `wide` (lists/grids). Pick one; don't invent a third.
- `StoryCard` is the canonical preview for the feed, tags, profiles and the reading list.
- Every list surface renders `EmptyState` rather than blank space.

## Accessibility — non-negotiable

- **Real `<label>`s.** `Input` and `Textarea` take a required `label` prop. Placeholder-as-label is not acceptable.
- **Visible focus.** A global `:focus-visible` ring is defined once. Never `outline: none` without a replacement.
- **Semantic elements.** Navigation is a `<nav>` with an `aria-label`; a control that navigates is an `<a>`, a control that acts is a `<button>`.
- **Skip link.** Provided by the root layout; keep `<main id="main">` intact.
- **Errors are announced** — `aria-invalid` + `aria-describedby`, wired for you by the form components.
- **Reduced motion** is honoured globally; don't add unconditional animation.
- **Images**: decorative images take `alt=""`. Cover images are decorative — the title is adjacent.

## Attribution

Do **not** copy Medium's branding, wordmark, logo, illustrations or marketing
copy. The visual language here — quiet neutrals, a single deep-green accent,
serif reading column — is our own. Reference the interaction patterns, never the
assets.
