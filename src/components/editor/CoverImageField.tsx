'use client';

import { useId, useState } from 'react';
import Image from 'next/image';
import { Button } from '@/components/ui/Button';
import { messageFor, uploadImage } from './storyClient';

/**
 * Cover image picker.
 *
 * The preview uses next/image with `unoptimized`: uploads are user content
 * served straight off local disk, so running them through the optimizer buys
 * nothing and would need every future storage host allow-listed in
 * next.config. Width/height are fixed so the layout cannot shift when the image
 * finishes loading.
 *
 * The alt text on the PREVIEW is deliberately descriptive of its role rather
 * than of the picture: this is a control, and the person using it is the person
 * who just chose the file. The story page's own alt text is Reading's concern.
 */

export type CoverImageFieldProps = {
  value: string | null;
  onChange: (url: string | null) => void;
  disabled?: boolean;
};

export function CoverImageField({ value, onChange, disabled = false }: CoverImageFieldProps) {
  const fieldId = useId();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const upload = await uploadImage(file);
      onChange(upload.url);
    } catch (uploadError) {
      setError(messageFor(uploadError));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={fieldId} className="text-sm font-medium text-ink">
        Cover image
      </label>
      <p id={`${fieldId}-hint`} className="text-xs text-ink-subtle">
        PNG, JPEG, WebP or GIF, up to 5MB. Shown on story cards and at the top of
        the story.
      </p>

      {value ? (
        <div className="flex flex-wrap items-center gap-4">
          <Image
            src={value}
            alt="Current cover image"
            width={160}
            height={90}
            unoptimized
            className="h-[90px] w-[160px] rounded-card border border-border object-cover"
          />
          <Button
            variant="secondary"
            size="sm"
            disabled={disabled || uploading}
            onClick={() => onChange(null)}
          >
            Remove cover
          </Button>
        </div>
      ) : null}

      <input
        id={fieldId}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        disabled={disabled || uploading}
        aria-describedby={error ? `${fieldId}-hint ${fieldId}-error` : `${fieldId}-hint`}
        onChange={(event) => handleFile(event.target.files?.[0])}
        className="text-sm text-ink file:mr-3 file:h-10 file:rounded-md file:border file:border-border file:bg-canvas file:px-3 file:text-sm file:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60"
      />

      <p role="status" aria-live="polite" className="min-h-5 text-xs text-ink-subtle">
        {uploading ? 'Uploading cover image…' : ''}
      </p>

      {error ? (
        <p id={`${fieldId}-error`} role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export default CoverImageField;
