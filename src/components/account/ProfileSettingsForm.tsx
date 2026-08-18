'use client';

import { useRef, useState, type FormEvent } from 'react';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import type { PublicUser } from '@/lib/types';
import { firstMessagePerField, submitJson } from './form-client';
import type { ApiResponse } from '@/lib/api';

export type ProfileSettingsFormProps = {
  user: PublicUser;
};

const BIO_MAX = 280;

/**
 * Edit display name, bio and avatar.
 *
 * Two separate submissions on purpose. The text fields PATCH JSON to
 * /api/profiles/me; the avatar POSTs multipart to /api/profiles/me/avatar the
 * moment a file is chosen. Bundling an image into the text form would mean a
 * failed 3MB upload also loses the bio someone just wrote.
 *
 * Neither request carries a user id — the server resolves the target from the
 * session. There is no field here a client could use to aim the edit at someone
 * else's row.
 */
export function ProfileSettingsForm({ user }: ProfileSettingsFormProps) {
  const [displayName, setDisplayName] = useState(user.displayName);
  const [bio, setBio] = useState(user.bio ?? '');
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl);

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage(null);
    setStatus(null);
    setFieldErrors({});

    const result = await submitJson<{ user: PublicUser }>('/api/profiles/me', 'PATCH', {
      displayName,
      bio,
    });

    setSubmitting(false);

    if (result.ok) {
      setDisplayName(result.data.user.displayName);
      setBio(result.data.user.bio ?? '');
      setStatus('Profile saved');
      return;
    }

    setFieldErrors(result.fieldErrors);
    setMessage(result.message);
  }

  async function onAvatarChange() {
    const file = fileInput.current?.files?.[0];
    if (!file) return;

    setUploading(true);
    setMessage(null);
    setStatus(null);

    const form = new FormData();
    form.set('file', file);

    let envelope: ApiResponse<{ user: PublicUser }> | null = null;
    try {
      const response = await fetch('/api/profiles/me/avatar', { method: 'POST', body: form });
      envelope = (await response.json()) as ApiResponse<{ user: PublicUser }>;
    } catch {
      envelope = null;
    }

    setUploading(false);
    if (fileInput.current) fileInput.current.value = '';

    if (envelope && envelope.ok) {
      setAvatarUrl(envelope.data.user.avatarUrl);
      setStatus('Photo updated');
      return;
    }

    setFieldErrors(envelope && !envelope.ok ? firstMessagePerField(envelope.error.fields) : {});
    setMessage(
      envelope && !envelope.ok ? envelope.error.message : 'That photo could not be uploaded.',
    );
  }

  return (
    <div className="flex flex-col gap-10">
      <section aria-labelledby="photo-heading" className="flex flex-col gap-4">
        <h2 id="photo-heading" className="font-serif text-lg font-semibold text-ink">
          Photo
        </h2>
        <div className="flex items-center gap-4">
          <Avatar name={displayName} src={avatarUrl} size="lg" />
          <div className="flex flex-col gap-1.5">
            <label htmlFor="avatar" className="text-sm font-medium text-ink">
              Profile photo
            </label>
            <p id="avatar-hint" className="text-xs text-ink-subtle">
              JPEG, PNG, GIF, WebP or AVIF, up to 5MB.
            </p>
            <input
              ref={fileInput}
              id="avatar"
              name="avatar"
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp,image/avif"
              aria-describedby="avatar-hint"
              disabled={uploading}
              onChange={onAvatarChange}
              className="text-sm text-ink file:mr-3 file:rounded-full file:border file:border-border file:bg-canvas file:px-3 file:py-1.5 file:text-sm file:text-ink"
            />
          </div>
        </div>
      </section>

      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
        <h2 className="font-serif text-lg font-semibold text-ink">About you</h2>

        {message ? (
          <p
            role="alert"
            className="rounded-md border border-danger/40 bg-danger/5 px-3 py-2 text-sm text-danger"
          >
            {message}
          </p>
        ) : null}

        <Input
          label="Display name"
          name="displayName"
          required
          value={displayName}
          error={fieldErrors.displayName}
          onChange={(event) => setDisplayName(event.target.value)}
        />

        <Textarea
          label="Bio"
          name="bio"
          rows={4}
          maxLength={BIO_MAX}
          hint={`${BIO_MAX - bio.length} characters left`}
          value={bio}
          error={fieldErrors.bio}
          onChange={(event) => setBio(event.target.value)}
        />

        <Input label="Handle" name="handle" value={`@${user.handle}`} readOnly disabled
          hint="Your handle is part of your profile address and cannot be changed here." />

        <div className="flex items-center gap-4">
          <Button type="submit" disabled={submitting || uploading}>
            {submitting ? 'Saving…' : 'Save changes'}
          </Button>
          {/* Async result announced without stealing focus. */}
          <span aria-live="polite" className="text-sm text-ink-muted">
            {uploading ? 'Uploading photo…' : (status ?? '')}
          </span>
        </div>
      </form>
    </div>
  );
}

export default ProfileSettingsForm;
