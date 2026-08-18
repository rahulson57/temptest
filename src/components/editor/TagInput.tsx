'use client';

import { useId, useState, type KeyboardEvent } from 'react';
import { MAX_TAGS_PER_STORY } from '@/lib/types';

/**
 * Tag entry, capped at five.
 *
 * WHY THE CAP IS ENFORCED HERE *AND* ON THE SERVER: this is a convenience, not
 * a control. The server returns 400 on the sixth tag regardless (see
 * tests/stories/tags-limit.test.ts); stopping it here just means the writer
 * finds out immediately instead of on save.
 *
 * ACCESSIBILITY
 *  - A real <label> for the text field, not a placeholder.
 *  - Each chip's remove control is a real <button> with an aria-label naming
 *    the tag ("Remove tag design"), because five buttons all labelled "Remove"
 *    are useless when read out of context.
 *  - Adding and removing announce through an aria-live region — a chip
 *    appearing is a visual-only event otherwise.
 *  - The cap message is tied to the input with aria-describedby.
 */

export type TagInputProps = {
  tags: string[];
  onChange: (tags: string[]) => void;
  disabled?: boolean;
};

export function TagInput({ tags, onChange, disabled = false }: TagInputProps) {
  const fieldId = useId();
  const [draft, setDraft] = useState('');
  const [message, setMessage] = useState('');

  const atCapacity = tags.length >= MAX_TAGS_PER_STORY;

  function addTag(raw: string) {
    const name = raw.trim().toLowerCase();
    if (name.length === 0) return;

    if (name.length > 30) {
      setMessage('Tag names are at most 30 characters.');
      return;
    }
    if (tags.includes(name)) {
      setMessage(`${name} is already added.`);
      setDraft('');
      return;
    }
    if (atCapacity) {
      setMessage(`You can use at most ${MAX_TAGS_PER_STORY} tags.`);
      return;
    }

    onChange([...tags, name]);
    setDraft('');
    setMessage(`Added ${name}.`);
  }

  function removeTag(name: string) {
    onChange(tags.filter((tag) => tag !== name));
    setMessage(`Removed ${name}.`);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter' || event.key === ',') {
      // Enter inside a form would submit it; this field owns the key.
      event.preventDefault();
      addTag(draft);
      return;
    }
    if (event.key === 'Backspace' && draft.length === 0 && tags.length > 0) {
      removeTag(tags[tags.length - 1]!);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={fieldId} className="text-sm font-medium text-ink">
        Topics
      </label>
      <p id={`${fieldId}-hint`} className="text-xs text-ink-subtle">
        Up to {MAX_TAGS_PER_STORY}. Press Enter after each one. {tags.length} of{' '}
        {MAX_TAGS_PER_STORY} used.
      </p>

      {tags.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {tags.map((tag) => (
            <li key={tag}>
              <span className="inline-flex h-8 items-center gap-1 rounded-full bg-surface pl-3 pr-1 text-sm text-ink-muted ring-1 ring-inset ring-border">
                {tag}
                <button
                  type="button"
                  aria-label={`Remove tag ${tag}`}
                  disabled={disabled}
                  onClick={() => removeTag(tag)}
                  className="inline-flex h-6 w-6 items-center justify-center rounded-full text-ink-subtle transition-colors hover:bg-border hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50"
                >
                  <span aria-hidden="true">×</span>
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <input
        id={fieldId}
        type="text"
        value={draft}
        disabled={disabled || atCapacity}
        aria-describedby={`${fieldId}-hint`}
        placeholder={atCapacity ? 'Tag limit reached' : 'design, writing, tools'}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => addTag(draft)}
        className="h-10 w-full rounded-md border border-border bg-canvas px-3 text-sm text-ink placeholder:text-ink-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60"
      />

      <p role="status" aria-live="polite" className="min-h-5 text-xs text-ink-subtle">
        {message}
      </p>
    </div>
  );
}

export default TagInput;
