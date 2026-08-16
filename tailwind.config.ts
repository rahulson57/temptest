import type { Config } from 'tailwindcss';
import plugin from 'tailwindcss/plugin';

/**
 * Reading-first design tokens.
 *
 * Principles (see docs/DESIGN.md):
 *  - Story text is serif, ~65ch measure, 1.75 line-height. Chrome is sans and quiet.
 *  - Neutral palette only; a single restrained accent for interactive affordances.
 *  - Every interactive element gets a visible focus-visible ring — never `outline: none`.
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        // Chrome / surfaces
        canvas: 'rgb(var(--color-canvas) / <alpha-value>)',
        surface: 'rgb(var(--color-surface) / <alpha-value>)',
        border: 'rgb(var(--color-border) / <alpha-value>)',
        // Text
        ink: 'rgb(var(--color-ink) / <alpha-value>)',
        'ink-muted': 'rgb(var(--color-ink-muted) / <alpha-value>)',
        'ink-subtle': 'rgb(var(--color-ink-subtle) / <alpha-value>)',
        // Interactive
        accent: 'rgb(var(--color-accent) / <alpha-value>)',
        'accent-ink': 'rgb(var(--color-accent-ink) / <alpha-value>)',
        danger: 'rgb(var(--color-danger) / <alpha-value>)',
      },
      fontFamily: {
        // Chrome: nav, buttons, meta.
        sans: [
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
        // Story body + titles.
        serif: [
          'Iowan Old Style',
          'Charter',
          'Georgia',
          'Cambria',
          'Times New Roman',
          'ui-serif',
          'serif',
        ],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      fontSize: {
        // Story body: large and calm.
        story: ['1.25rem', { lineHeight: '1.75' }],
        'story-sm': ['1.125rem', { lineHeight: '1.75' }],
      },
      lineHeight: {
        reading: '1.75',
      },
      maxWidth: {
        measure: '65ch',
        'measure-wide': '76ch',
      },
      borderRadius: {
        card: '0.5rem',
      },
      boxShadow: {
        card: '0 1px 2px rgb(0 0 0 / 0.04), 0 1px 3px rgb(0 0 0 / 0.06)',
      },
      transitionDuration: {
        DEFAULT: '150ms',
      },
    },
  },
  plugins: [
    plugin(({ addUtilities, addComponents, theme }) => {
      addUtilities({
        // ~65ch measure, centred. The one true reading column.
        '.prose-measure': {
          maxWidth: theme('maxWidth.measure'),
          marginLeft: 'auto',
          marginRight: 'auto',
        },
        // Consistent, always-visible keyboard affordance.
        '.focus-ring': {
          '&:focus-visible': {
            outline: '2px solid rgb(var(--color-accent))',
            outlineOffset: '2px',
            borderRadius: '0.25rem',
          },
        },
        '.sr-only-focusable': {
          '&:not(:focus):not(:focus-within)': {
            position: 'absolute',
            width: '1px',
            height: '1px',
            padding: '0',
            margin: '-1px',
            overflow: 'hidden',
            clip: 'rect(0, 0, 0, 0)',
            whiteSpace: 'nowrap',
            borderWidth: '0',
          },
        },
      });

      // Typography for sanitized story HTML. Applied wherever story bodies render.
      const serifStack = String(theme('fontFamily.serif'));
      const monoStack = String(theme('fontFamily.mono'));

      addComponents({
        '.story-prose': {
          fontFamily: serifStack,
          fontSize: '1.25rem',
          lineHeight: '1.75',
          color: 'rgb(var(--color-ink))',
          '& > * + *': { marginTop: '1.5em' },
          '& h1': { fontSize: '2rem', lineHeight: '1.25', fontWeight: '700', marginTop: '2em' },
          '& h2': { fontSize: '1.6rem', lineHeight: '1.3', fontWeight: '700', marginTop: '1.8em' },
          '& h3': { fontSize: '1.3rem', lineHeight: '1.35', fontWeight: '700', marginTop: '1.6em' },
          '& a': {
            color: 'rgb(var(--color-ink))',
            textDecoration: 'underline',
            textUnderlineOffset: '3px',
          },
          '& blockquote': {
            borderLeft: '3px solid rgb(var(--color-border))',
            paddingLeft: '1.25rem',
            fontStyle: 'italic',
            color: 'rgb(var(--color-ink-muted))',
          },
          '& pre': {
            fontFamily: monoStack,
            fontSize: '0.95rem',
            lineHeight: '1.6',
            background: 'rgb(var(--color-surface))',
            border: '1px solid rgb(var(--color-border))',
            borderRadius: '0.5rem',
            padding: '1rem',
            overflowX: 'auto',
          },
          '& code': {
            fontFamily: monoStack,
            fontSize: '0.9em',
          },
          '& pre code': { fontSize: 'inherit' },
          '& ul': { listStyleType: 'disc', paddingLeft: '1.5rem' },
          '& ol': { listStyleType: 'decimal', paddingLeft: '1.5rem' },
          '& li + li': { marginTop: '0.5em' },
          '& img': { maxWidth: '100%', height: 'auto', borderRadius: '0.5rem' },
          '& hr': { border: '0', borderTop: '1px solid rgb(var(--color-border))', margin: '2.5em 0' },
        },
      });
    }),
  ],
};

export default config;
