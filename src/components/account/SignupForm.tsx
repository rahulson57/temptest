'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { safeNextPath, submitJson } from './form-client';

/**
 * Create-account form.
 *
 * THE PASSWORD IS NEVER RE-RENDERED FROM A RESPONSE. On a failed submit the
 * other fields keep their values (retyping a handle because an email was
 * malformed is infuriating) but the password input is cleared and the failure
 * envelope only ever carries field MESSAGES, never field VALUES. So a password
 * cannot end up in a server log, an error toast, or the DOM after a round trip.
 *
 * Field errors come back keyed by field name and go straight to <Input error>,
 * which wires aria-describedby + aria-invalid. The summary is role="alert" so
 * a screen reader hears the failure without hunting for the red input.
 */
export function SignupForm() {
  const params = useSearchParams();
  const next = safeNextPath(params.get('next'));

  const [values, setValues] = useState({
    email: '',
    password: '',
    handle: '',
    displayName: '',
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function update(field: keyof typeof values, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage(null);
    setFieldErrors({});

    const result = await submitJson('/api/auth/signup', 'POST', values);

    if (result.ok) {
      // Full navigation, not a client push: the layout must re-resolve the
      // session server-side so the header renders the signed-in state.
      window.location.assign(next);
      return;
    }

    setSubmitting(false);
    setFieldErrors(result.fieldErrors);
    setMessage(result.message);
    setValues((current) => ({ ...current, password: '' }));
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      {message ? (
        <p role="alert" className="rounded-md border border-danger/40 bg-danger/5 px-3 py-2 text-sm text-danger">
          {message}
        </p>
      ) : null}

      <Input
        label="Display name"
        name="displayName"
        autoComplete="name"
        required
        value={values.displayName}
        error={fieldErrors.displayName}
        onChange={(event) => update('displayName', event.target.value)}
      />

      <Input
        label="Handle"
        name="handle"
        autoComplete="username"
        required
        hint="Letters, numbers and underscores. This becomes your profile address."
        value={values.handle}
        error={fieldErrors.handle}
        onChange={(event) => update('handle', event.target.value)}
      />

      <Input
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        required
        value={values.email}
        error={fieldErrors.email}
        onChange={(event) => update('email', event.target.value)}
      />

      <Input
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        hint="At least 8 characters."
        value={values.password}
        error={fieldErrors.password}
        onChange={(event) => update('password', event.target.value)}
      />

      <Button type="submit" size="lg" disabled={submitting}>
        {submitting ? 'Creating your account…' : 'Create account'}
      </Button>

      <p className="text-sm text-ink-muted">
        Already have an account?{' '}
        <Link href="/login" className="font-medium text-ink underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}

export default SignupForm;
