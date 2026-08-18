import { Mark, Node, mergeAttributes } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';

/**
 * The editor's schema.
 *
 * It is deliberately a SUBSET of what src/lib/sanitize.ts allows: anything the
 * toolbar can produce must survive sanitization, so the writer never watches
 * their formatting vanish on save. The reverse is fine — sanitize.ts also
 * permits h3, which the toolbar does not offer.
 *
 * WHY Link AND Image ARE HAND-WRITTEN HERE (DEC-157)
 * --------------------------------------------------
 * @tiptap/extension-link and @tiptap/extension-image are not in package.json,
 * and package.json is foundations-owned and outside this vertical's fileScope.
 * TASK-008 adds both packages, at which point this file shrinks to a StarterKit
 * call plus two imports and the two definitions below are deleted wholesale.
 *
 * They are intentionally minimal: a mark carrying href/rel/target and an atom
 * node carrying src/alt. No paste rules, no input rules, no click handling —
 * the official extensions do those better and are about to replace these.
 */

/** Schemes an href may use. `javascript:` is absent by design. */
const SAFE_HREF = /^(https?:|mailto:|\/)/i;

function isSafeHref(href: string | null | undefined): href is string {
  return typeof href === 'string' && href.length > 0 && SAFE_HREF.test(href.trim());
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    quillLink: {
      setQuillLink: (attributes: { href: string }) => ReturnType;
      unsetQuillLink: () => ReturnType;
    };
    quillImage: {
      setQuillImage: (attributes: { src: string; alt?: string }) => ReturnType;
    };
  }
}

/**
 * Anchor mark.
 *
 * `inclusive: false` is the difference between "typing after a link continues
 * the link" (maddening) and "typing after a link is plain text" (expected).
 * rel is fixed at nofollow noopener to match what sanitize.ts rewrites it to on
 * write, so the editor's HTML and the stored HTML agree.
 */
export const QuillLink = Mark.create({
  name: 'link',
  priority: 1000,
  keepOnSplit: false,
  inclusive: false,
  exitable: true,

  addAttributes() {
    return {
      href: { default: null },
      rel: { default: 'nofollow noopener' },
      target: { default: null },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'a[href]',
        getAttrs: (element) => {
          const href = (element as HTMLElement).getAttribute('href');
          // Refusing here means a pasted `javascript:` href never enters the
          // document at all, rather than relying on the server to strip it.
          return isSafeHref(href) ? { href: href.trim() } : false;
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['a', mergeAttributes(HTMLAttributes, { rel: 'nofollow noopener' }), 0];
  },

  addCommands() {
    return {
      setQuillLink:
        (attributes) =>
        ({ chain }) => {
          if (!isSafeHref(attributes.href)) return false;
          return chain()
            .setMark(this.name, { href: attributes.href.trim() })
            .setMeta('preventAutolink', true)
            .run();
        },
      unsetQuillLink:
        () =>
        ({ chain }) =>
          chain().unsetMark(this.name, { extendEmptyMarkRange: true }).run(),
    };
  },
});

/**
 * Inline image.
 *
 * `atom: true` makes it a single indivisible unit, so Backspace deletes the
 * image rather than dropping the caret inside an empty node. `alt` is a real
 * attribute rather than an afterthought because the insert UI requires it.
 */
export const QuillImage = Node.create({
  name: 'image',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      src: { default: null },
      alt: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: 'img[src]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['img', mergeAttributes(HTMLAttributes)];
  },

  addCommands() {
    return {
      setQuillImage:
        (attributes) =>
        ({ commands }) => {
          if (!isSafeHref(attributes.src)) return false;
          return commands.insertContent({ type: this.name, attrs: attributes });
        },
    };
  },
});

/**
 * Everything the toolbar exposes: h1/h2, bold, italic, link, blockquote, code
 * block, image, horizontal rule, bullet and ordered lists.
 */
export const editorExtensions = [
  StarterKit.configure({
    heading: { levels: [1, 2] },
    // The story page has its own typography; the editor mirrors it via CSS
    // rather than through ProseMirror classes.
    codeBlock: { HTMLAttributes: { class: 'story-code-block' } },
  }),
  QuillLink,
  QuillImage,
];

export { isSafeHref };
