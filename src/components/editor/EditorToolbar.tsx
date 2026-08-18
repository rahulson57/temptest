'use client';

import { useId, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { cn } from '@/lib/cn';
import { messageFor, uploadImage } from './storyClient';

/**
 * The formatting toolbar.
 *
 * ACCESSIBILITY CONTRACT (docs/STACK.md §UI, and the reason this is not a row
 * of styled <div>s):
 *  - Every control is a real <button type="button"> — Tab-reachable, activated
 *    by Enter AND Space, and announced as a button without any ARIA at all.
 *  - Each carries an aria-label, because the visible glyph ("B", "❝") is not a
 *    name a screen reader can read usefully.
 *  - Toggles carry aria-pressed reflecting the CURRENT selection, so a user who
 *    lands mid-sentence is told what formatting is already applied rather than
 *    having to infer it from a highlight they may not see.
 *  - The two panels (link, image) are disclosure widgets: aria-expanded +
 *    aria-controls, and they are removed from the DOM when closed so nothing
 *    invisible is focusable.
 *  - Nothing here is a keyboard trap. The panels close on Escape and return
 *    focus to the editor.
 */

export type EditorToolbarProps = {
  editor: Editor | null;
  /** Disables every control (e.g. while the story is being deleted). */
  disabled?: boolean;
  className?: string;
};

type ToggleSpec = {
  id: string;
  label: string;
  glyph: string;
  isActive: (editor: Editor) => boolean;
  run: (editor: Editor) => void;
};

/**
 * Toggles, in the order a writer reaches for them. `isActive` drives
 * aria-pressed; `run` always re-focuses the editor so the caret never gets
 * stranded on the button.
 */
const TOGGLES: ToggleSpec[] = [
  {
    id: 'bold',
    label: 'Bold',
    glyph: 'B',
    isActive: (editor) => editor.isActive('bold'),
    run: (editor) => editor.chain().focus().toggleBold().run(),
  },
  {
    id: 'italic',
    label: 'Italic',
    glyph: 'I',
    isActive: (editor) => editor.isActive('italic'),
    run: (editor) => editor.chain().focus().toggleItalic().run(),
  },
  {
    id: 'h1',
    label: 'Heading level 1',
    glyph: 'H1',
    isActive: (editor) => editor.isActive('heading', { level: 1 }),
    run: (editor) => editor.chain().focus().toggleHeading({ level: 1 }).run(),
  },
  {
    id: 'h2',
    label: 'Heading level 2',
    glyph: 'H2',
    isActive: (editor) => editor.isActive('heading', { level: 2 }),
    run: (editor) => editor.chain().focus().toggleHeading({ level: 2 }).run(),
  },
  {
    id: 'blockquote',
    label: 'Block quote',
    glyph: '❝',
    isActive: (editor) => editor.isActive('blockquote'),
    run: (editor) => editor.chain().focus().toggleBlockquote().run(),
  },
  {
    id: 'codeBlock',
    label: 'Code block',
    glyph: '</>',
    isActive: (editor) => editor.isActive('codeBlock'),
    run: (editor) => editor.chain().focus().toggleCodeBlock().run(),
  },
  {
    id: 'bulletList',
    label: 'Bulleted list',
    glyph: '•—',
    isActive: (editor) => editor.isActive('bulletList'),
    run: (editor) => editor.chain().focus().toggleBulletList().run(),
  },
  {
    id: 'orderedList',
    label: 'Numbered list',
    glyph: '1.',
    isActive: (editor) => editor.isActive('orderedList'),
    run: (editor) => editor.chain().focus().toggleOrderedList().run(),
  },
];

const BUTTON_BASE =
  'inline-flex h-9 min-w-9 items-center justify-center rounded-md border px-2 text-sm ' +
  'font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 ' +
  'focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50';

const BUTTON_OFF = 'border-border bg-canvas text-ink hover:bg-surface';
// Pressed state is a real colour inversion, not just a tint: a 1.2:1 background
// shift is invisible to plenty of people, and aria-pressed alone does not help
// a sighted mouse user.
const BUTTON_ON = 'border-accent bg-accent text-accent-ink';

export function EditorToolbar({ editor, disabled = false, className }: EditorToolbarProps) {
  const linkPanelId = useId();
  const imagePanelId = useId();
  const linkInputRef = useRef<HTMLInputElement>(null);

  const [openPanel, setOpenPanel] = useState<'link' | 'image' | null>(null);
  const [linkHref, setLinkHref] = useState('');
  const [imageAlt, setImageAlt] = useState('');
  const [imageError, setImageError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const ready = editor !== null && !disabled;

  function closePanels(refocusEditor = true) {
    setOpenPanel(null);
    setImageError(null);
    if (refocusEditor) editor?.chain().focus().run();
  }

  function togglePanel(panel: 'link' | 'image') {
    if (openPanel === panel) {
      closePanels();
      return;
    }
    setOpenPanel(panel);
    setImageError(null);
    if (panel === 'link' && editor) {
      // Prefill with the href already on the selection so "edit this link" is
      // not retyping it from scratch.
      const existing = editor.getAttributes('link').href;
      setLinkHref(typeof existing === 'string' ? existing : '');
      window.setTimeout(() => linkInputRef.current?.focus(), 0);
    }
  }

  function applyLink() {
    if (!editor) return;
    const href = linkHref.trim();
    if (href.length === 0) {
      editor.chain().focus().unsetQuillLink().run();
      closePanels(false);
      return;
    }

    const { from, to } = editor.state.selection;
    if (from === to) {
      // Nothing selected: insert the URL as its own link text rather than
      // silently doing nothing, which is what an empty setMark would do.
      editor.chain().focus().insertContent(href).run();
      editor
        .chain()
        .focus()
        .setTextSelection({ from, to: from + href.length })
        .setQuillLink({ href })
        .run();
    } else {
      editor.chain().focus().setQuillLink({ href }).run();
    }
    closePanels(false);
    setLinkHref('');
  }

  async function insertImage(file: File | undefined) {
    if (!editor || !file) return;
    setImageError(null);
    setUploading(true);
    try {
      const upload = await uploadImage(file);
      editor
        .chain()
        .focus()
        .setQuillImage({ src: upload.url, alt: imageAlt.trim() || 'Story image' })
        .run();
      setImageAlt('');
      closePanels(false);
    } catch (error) {
      setImageError(messageFor(error));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className={cn('border-b border-border bg-surface/60', className)}>
      <div
        role="toolbar"
        aria-label="Text formatting"
        aria-controls="story-body-editor"
        className="flex flex-wrap items-center gap-1.5 p-2"
      >
        {TOGGLES.map((toggle) => {
          const active = ready ? toggle.isActive(editor) : false;
          return (
            <button
              key={toggle.id}
              type="button"
              aria-label={toggle.label}
              aria-pressed={active}
              disabled={!ready}
              onClick={() => editor && toggle.run(editor)}
              className={cn(BUTTON_BASE, active ? BUTTON_ON : BUTTON_OFF)}
            >
              <span aria-hidden="true">{toggle.glyph}</span>
            </button>
          );
        })}

        <button
          type="button"
          aria-label="Horizontal rule"
          disabled={!ready}
          onClick={() => editor?.chain().focus().setHorizontalRule().run()}
          className={cn(BUTTON_BASE, BUTTON_OFF)}
        >
          <span aria-hidden="true">—</span>
        </button>

        <span aria-hidden="true" className="mx-1 h-6 w-px bg-border" />

        <button
          type="button"
          aria-label="Link"
          aria-pressed={ready ? editor.isActive('link') : false}
          aria-expanded={openPanel === 'link'}
          aria-controls={linkPanelId}
          disabled={!ready}
          onClick={() => togglePanel('link')}
          className={cn(
            BUTTON_BASE,
            ready && editor.isActive('link') ? BUTTON_ON : BUTTON_OFF,
          )}
        >
          <span aria-hidden="true">🔗</span>
        </button>

        <button
          type="button"
          aria-label="Insert image"
          aria-expanded={openPanel === 'image'}
          aria-controls={imagePanelId}
          disabled={!ready}
          onClick={() => togglePanel('image')}
          className={cn(BUTTON_BASE, BUTTON_OFF)}
        >
          <span aria-hidden="true">🖼</span>
        </button>
      </div>

      {openPanel === 'link' ? (
        <div
          id={linkPanelId}
          className="flex flex-wrap items-end gap-3 border-t border-border p-3"
          onKeyDown={(event) => {
            if (event.key === 'Escape') closePanels();
          }}
        >
          <div className="flex min-w-56 flex-1 flex-col gap-1.5">
            <label htmlFor={`${linkPanelId}-url`} className="text-sm font-medium text-ink">
              Link address
            </label>
            <input
              id={`${linkPanelId}-url`}
              ref={linkInputRef}
              type="url"
              inputMode="url"
              value={linkHref}
              placeholder="https://example.com"
              onChange={(event) => setLinkHref(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  applyLink();
                }
              }}
              className="h-10 w-full rounded-md border border-border bg-canvas px-3 text-sm text-ink placeholder:text-ink-subtle"
            />
          </div>
          <button
            type="button"
            onClick={applyLink}
            className={cn(BUTTON_BASE, 'h-10 border-accent bg-accent px-4 text-accent-ink')}
          >
            Apply link
          </button>
          <button
            type="button"
            onClick={() => {
              editor?.chain().focus().unsetQuillLink().run();
              setLinkHref('');
              closePanels(false);
            }}
            className={cn(BUTTON_BASE, 'h-10 px-4', BUTTON_OFF)}
          >
            Remove link
          </button>
        </div>
      ) : null}

      {openPanel === 'image' ? (
        <div
          id={imagePanelId}
          className="flex flex-wrap items-end gap-3 border-t border-border p-3"
          onKeyDown={(event) => {
            if (event.key === 'Escape') closePanels();
          }}
        >
          <div className="flex min-w-56 flex-1 flex-col gap-1.5">
            <label htmlFor={`${imagePanelId}-alt`} className="text-sm font-medium text-ink">
              Describe the image
            </label>
            <p id={`${imagePanelId}-alt-hint`} className="text-xs text-ink-subtle">
              Read aloud to people who cannot see it. Say what it shows, not
              &ldquo;image of&rdquo;.
            </p>
            <input
              id={`${imagePanelId}-alt`}
              type="text"
              value={imageAlt}
              aria-describedby={`${imagePanelId}-alt-hint`}
              onChange={(event) => setImageAlt(event.target.value)}
              className="h-10 w-full rounded-md border border-border bg-canvas px-3 text-sm text-ink"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${imagePanelId}-file`} className="text-sm font-medium text-ink">
              Image file
            </label>
            <input
              id={`${imagePanelId}-file`}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              disabled={uploading}
              aria-describedby={imageError ? `${imagePanelId}-error` : undefined}
              onChange={(event) => insertImage(event.target.files?.[0])}
              className="text-sm text-ink file:mr-3 file:h-10 file:rounded-md file:border file:border-border file:bg-canvas file:px-3 file:text-sm file:text-ink"
            />
          </div>
          <p role="status" aria-live="polite" className="w-full text-sm text-ink-subtle">
            {uploading ? 'Uploading image…' : ''}
          </p>
          {imageError ? (
            <p id={`${imagePanelId}-error`} role="alert" className="w-full text-sm text-danger">
              {imageError}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default EditorToolbar;
