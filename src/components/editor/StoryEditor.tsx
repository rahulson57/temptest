'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import type { StoryDto } from '@/server/stories/serialize';
import type { StoryStatus } from '@/lib/types';
import { CoverImageField } from './CoverImageField';
import { RichTextEditor } from './RichTextEditor';
import { SaveStatus, type SaveState } from './SaveStatus';
import { TagInput } from './TagInput';
import {
  autosaveStory,
  createStory,
  deleteStory,
  messageFor,
  publishStory,
  unpublishStory,
  updateStory,
} from './storyClient';

/**
 * The writing surface: title, subtitle, body, cover, tags, and the publish
 * controls — plus the autosave loop that ties them together.
 *
 * HOW AUTOSAVE WORKS AND WHY IT IS SHAPED THIS WAY
 *
 * Every edit schedules a save 2 seconds in the future and cancels the previous
 * schedule, so a burst of typing produces ONE request when the writer pauses,
 * not one per keystroke.
 *
 * The pending values live in a ref, not in the timer's closure. A timer that
 * captured state would save whatever the document looked like when the timer
 * was armed — which, with a 2-second debounce, is reliably two seconds of lost
 * typing. The ref is always current.
 *
 * A save in flight sets `savingRef`; a change arriving mid-flight re-arms the
 * timer instead of firing a second overlapping PATCH. Two concurrent saves of
 * the same row can land out of order, and the loser silently overwrites newer
 * text with older text.
 *
 * The FIRST save of a new story is a POST (there is no id yet); it adopts the
 * returned id and rewrites the URL to /write/<id> with router.replace, so a
 * reload resumes the same draft rather than starting a second empty one.
 */

const AUTOSAVE_DELAY_MS = 2000;

export type StoryEditorProps = {
  /** Existing story when editing; null for a new one. */
  story: StoryDto | null;
};

type EditorSnapshot = {
  id: string | null;
  title: string;
  subtitle: string;
  bodyHtml: string;
  coverImageUrl: string | null;
  tags: string[];
};

export function StoryEditor({ story }: StoryEditorProps) {
  const router = useRouter();

  const [storyId, setStoryId] = useState<string | null>(story?.id ?? null);
  const [title, setTitle] = useState(story?.title ?? '');
  const [subtitle, setSubtitle] = useState(story?.subtitle ?? '');
  const [bodyHtml, setBodyHtml] = useState(story?.bodyHtml ?? '');
  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(story?.coverImageUrl ?? null);
  const [tags, setTags] = useState<string[]>(story?.tags.map((tag) => tag.name) ?? []);

  const [status, setStatus] = useState<StoryStatus>(story?.status ?? 'DRAFT');
  const [slug, setSlug] = useState(story?.slug ?? '');

  const [saveState, setSaveState] = useState<SaveState>(story ? 'saved' : 'idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(story?.updatedAt ?? null);

  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  /** Always-current values for the debounced save (see the note above). */
  const snapshotRef = useRef<EditorSnapshot>({
    id: story?.id ?? null,
    title: story?.title ?? '',
    subtitle: story?.subtitle ?? '',
    bodyHtml: story?.bodyHtml ?? '',
    coverImageUrl: story?.coverImageUrl ?? null,
    tags: story?.tags.map((tag) => tag.name) ?? [],
  });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingRef = useRef(false);
  const dirtyRef = useRef(false);
  const tagsDirtyRef = useRef(false);

  const applyServerStory = useCallback((saved: StoryDto) => {
    snapshotRef.current.id = saved.id;
    setStoryId(saved.id);
    setStatus(saved.status);
    setSlug(saved.slug);
    setSavedAt(saved.updatedAt);
  }, []);

  /** Persist the current snapshot. Resolves once the server has it. */
  const save = useCallback(async (): Promise<void> => {
    const snapshot = snapshotRef.current;
    savingRef.current = true;
    dirtyRef.current = false;
    setSaveState('saving');
    setSaveError(null);

    try {
      if (snapshot.id === null) {
        // A brand-new story needs a title the server will accept; someone who
        // starts by writing the body should not be blocked from saving it.
        const created = await createStory({
          title: snapshot.title.trim() || 'Untitled',
          subtitle: snapshot.subtitle,
          bodyHtml: snapshot.bodyHtml,
          coverImageUrl: snapshot.coverImageUrl ?? '',
          tags: snapshot.tags,
        });
        tagsDirtyRef.current = false;
        applyServerStory(created);
        // replace, not push: the empty /write entry should not sit in history
        // as a "back" target that reopens a blank editor.
        router.replace(`/write/${created.id}`, { scroll: false });
      } else {
        const saved = await autosaveStory(snapshot.id, {
          title: snapshot.title,
          subtitle: snapshot.subtitle,
          bodyHtml: snapshot.bodyHtml,
          coverImageUrl: snapshot.coverImageUrl ?? '',
        });
        applyServerStory(saved);

        // Tags are not part of the autosave contract, so they ride a separate
        // PATCH — and only when they actually changed.
        if (tagsDirtyRef.current) {
          const withTags = await updateStory(snapshot.id, { tags: snapshot.tags });
          tagsDirtyRef.current = false;
          applyServerStory(withTags);
        }
      }

      setSaveState('saved');
    } catch (error) {
      setSaveState('error');
      setSaveError(messageFor(error));
      // The save failed, so the document is still unsaved: keep it dirty so the
      // unload guard still warns and the next edit retries.
      dirtyRef.current = true;
    } finally {
      savingRef.current = false;
    }
  }, [applyServerStory, router]);

  /** Arm (or re-arm) the debounce. */
  const scheduleSave = useCallback(() => {
    dirtyRef.current = true;
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      // A save is already in flight: wait it out rather than racing it.
      if (savingRef.current) {
        scheduleSave();
        return;
      }
      void save();
    }, AUTOSAVE_DELAY_MS);
  }, [save]);

  /** Save now, cancelling any pending debounce. Used before publish/unpublish. */
  const flush = useCallback(async (): Promise<void> => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    while (savingRef.current) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    if (dirtyRef.current || snapshotRef.current.id === null) await save();
  }, [save]);

  // Cancel the pending timer on unmount so a save cannot fire against an
  // unmounted component (and, worse, after the story has been deleted).
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, []);

  // Last line of defence for unsaved work: the browser's own confirmation.
  useEffect(() => {
    function onBeforeUnload(event: BeforeUnloadEvent) {
      if (!dirtyRef.current) return;
      event.preventDefault();
      event.returnValue = '';
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  function editField<K extends keyof EditorSnapshot>(key: K, value: EditorSnapshot[K]) {
    snapshotRef.current[key] = value;
    scheduleSave();
  }

  async function runAction(action: () => Promise<StoryDto>) {
    setBusy(true);
    setActionError(null);
    try {
      await flush();
      applyServerStory(await action());
      // The story's public visibility changed; any cached list is now stale.
      router.refresh();
    } catch (error) {
      setActionError(messageFor(error));
    } finally {
      setBusy(false);
    }
  }

  async function handlePublish() {
    if (snapshotRef.current.title.trim().length === 0) {
      setActionError('Give your story a title before publishing it.');
      return;
    }
    await runAction(() => publishStory(snapshotRef.current.id!));
  }

  async function handleUnpublish() {
    await runAction(() => unpublishStory(snapshotRef.current.id!));
  }

  async function handleDelete() {
    const id = snapshotRef.current.id;
    if (!id) {
      router.push('/drafts');
      return;
    }
    setBusy(true);
    setActionError(null);
    try {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = null;
      dirtyRef.current = false;
      await deleteStory(id);
      router.push('/drafts');
      router.refresh();
    } catch (error) {
      setActionError(messageFor(error));
      setBusy(false);
    }
  }

  const published = status === 'PUBLISHED';

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <span
            className={
              published
                ? 'inline-flex h-6 items-center rounded-full bg-accent px-3 text-xs font-medium text-accent-ink'
                : 'inline-flex h-6 items-center rounded-full bg-surface px-3 text-xs font-medium text-ink-muted ring-1 ring-inset ring-border'
            }
          >
            {published ? 'Published' : 'Draft'}
          </span>
          {published && slug ? (
            <a href={`/story/${slug}`} className="text-sm text-ink-muted underline underline-offset-4">
              View the published story
            </a>
          ) : null}
        </div>

        <SaveStatus state={saveState} error={saveError} savedAt={savedAt} />
      </div>

      <div className="flex flex-col gap-5">
        <Input
          label="Title"
          value={title}
          maxLength={120}
          placeholder="What are you writing about?"
          hint="Up to 120 characters. This becomes the story's link."
          disabled={busy}
          onChange={(event) => {
            setTitle(event.target.value);
            editField('title', event.target.value);
          }}
          className="h-12 font-serif text-lg"
        />

        <Input
          label="Subtitle"
          value={subtitle}
          maxLength={200}
          placeholder="Optional — one line that says why this is worth reading"
          disabled={busy}
          onChange={(event) => {
            setSubtitle(event.target.value);
            editField('subtitle', event.target.value);
          }}
        />
      </div>

      <RichTextEditor
        initialHtml={bodyHtml}
        disabled={busy}
        onChange={(html) => {
          setBodyHtml(html);
          editField('bodyHtml', html);
        }}
      />

      <div className="grid gap-8 sm:grid-cols-2">
        <CoverImageField
          value={coverImageUrl}
          disabled={busy}
          onChange={(url) => {
            setCoverImageUrl(url);
            editField('coverImageUrl', url);
          }}
        />

        <TagInput
          tags={tags}
          disabled={busy}
          onChange={(next) => {
            setTags(next);
            tagsDirtyRef.current = true;
            editField('tags', next);
          }}
        />
      </div>

      <div className="flex flex-col gap-4 border-t border-border pt-6">
        <div className="flex flex-wrap items-center gap-3">
          {published ? (
            <Button variant="secondary" disabled={busy} onClick={handleUnpublish}>
              Unpublish
            </Button>
          ) : (
            <Button disabled={busy} onClick={handlePublish}>
              Publish
            </Button>
          )}

          <Button
            variant="ghost"
            disabled={busy || saveState === 'saving'}
            onClick={() => void flush()}
          >
            Save now
          </Button>

          <div className="ml-auto">
            {confirmingDelete ? (
              <div className="flex flex-wrap items-center gap-3">
                <p id="delete-confirm-message" className="text-sm text-ink">
                  Delete this story permanently?
                </p>
                <Button
                  variant="danger"
                  disabled={busy}
                  aria-describedby="delete-confirm-message"
                  onClick={handleDelete}
                >
                  Yes, delete it
                </Button>
                <Button variant="secondary" disabled={busy} onClick={() => setConfirmingDelete(false)}>
                  Keep it
                </Button>
              </div>
            ) : (
              <Button
                variant="danger"
                disabled={busy}
                aria-haspopup="true"
                onClick={() => setConfirmingDelete(true)}
              >
                Delete story
              </Button>
            )}
          </div>
        </div>

        {actionError ? (
          <p role="alert" className="text-sm text-danger">
            {actionError}
          </p>
        ) : null}

        {!storyId ? (
          <p className="text-sm text-ink-subtle">
            This draft is saved automatically once you start writing.
          </p>
        ) : null}
      </div>
    </div>
  );
}

export default StoryEditor;
