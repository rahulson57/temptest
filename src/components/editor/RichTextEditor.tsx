'use client';

import { useId } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import { EditorToolbar } from './EditorToolbar';
import { editorExtensions } from './extensions';

/**
 * The story body editor.
 *
 * KEYBOARD ACCESS — the part that is easy to get wrong.
 *
 * A contenteditable is Tab-reachable by default, and the toolbar sits before it
 * in DOM order, so the natural tab sequence is: title → subtitle → toolbar
 * buttons → editor → tags → actions. Nothing here alters tabindex.
 *
 * The one genuine trap risk is Tab INSIDE a list: StarterKit's ListItem binds
 * Tab to "indent this item", so a user in a bulleted list cannot Tab out. Two
 * things address that, and both are needed:
 *  1. Escape blurs the editor, so there is ALWAYS a single key that gets you
 *     out from anywhere, including a nested list.
 *  2. That escape route is stated in visible text tied to the editor by
 *     aria-describedby — WCAG 2.1.2 permits a non-standard exit method only if
 *     the user is told what it is, and a hint that only screen readers get
 *     fails the sighted keyboard user this is mostly for.
 *
 * `immediatelyRender: false` is required under the App Router: rendering
 * ProseMirror during SSR produces markup React then hydrates differently, and
 * Tiptap throws rather than let that corrupt the document.
 */

export type RichTextEditorProps = {
  /** Initial HTML. Read once — this is an uncontrolled editor by design. */
  initialHtml: string;
  onChange: (html: string) => void;
  disabled?: boolean;
};

export function RichTextEditor({ initialHtml, onChange, disabled = false }: RichTextEditorProps) {
  const hintId = useId();

  const editor = useEditor({
    extensions: editorExtensions,
    content: initialHtml,
    editable: !disabled,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        id: 'story-body-editor',
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': 'Story body',
        'aria-describedby': hintId,
        class:
          'story-prose min-h-[24rem] w-full max-w-none px-4 py-6 focus:outline-none ' +
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
      },
      handleKeyDown: (view, event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          // Blur, don't move focus: the browser then resumes tabbing from the
          // editor's position in the document, which is where the user expects
          // the next Tab to continue from.
          view.dom.blur();
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor: instance }) => {
      onChange(instance.getHTML());
    },
  });

  return (
    <div className="overflow-hidden rounded-card border border-border bg-canvas focus-within:border-accent">
      <EditorToolbar editor={editor} disabled={disabled} />

      <p id={hintId} className="border-b border-border px-4 py-2 text-xs text-ink-subtle">
        Press <kbd className="rounded border border-border px-1">Escape</kbd> to leave the
        editor, then <kbd className="rounded border border-border px-1">Tab</kbd> to continue.
        Inside a list, Tab indents and Shift + Tab outdents.
      </p>

      {editor ? (
        <EditorContent editor={editor} />
      ) : (
        // Reserve the space so the page does not jump when ProseMirror mounts.
        <div className="min-h-[24rem] px-4 py-6 text-ink-subtle">Loading the editor…</div>
      )}
    </div>
  );
}

export default RichTextEditor;
