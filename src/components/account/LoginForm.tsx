'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { safeNextPath, submitJson } from './form-client';

/**
 * Sign-in form.
 *
 * ONE ERROR MESSAGE FOR EVERY CREDENTIAL FAILURE, and it is deliberately not
 * attached to a field. Highlighting the email input on "unknown email" would
 * rebuild the account-enumeration oracle the server carefully avoids: the API
 * returns an identical 401 body for a wrong password and an unknown address, so
 * the UI must not add the distinction back on the client.
 *
 * The password is cleared on failure and never repopulated from a response.
 */
export function LoginForm() {
  const params = useSearchParams();
  const next = safeNextPath(params.get('next'));

  const [values, setValues] = useState({ email: '', password: '' });
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

    const result = await submitJson('/api/auth/login', 'POST', values);

    if (result.ok) {
      window.location.assign(next);
      return;
    }

    setSubmitting(false);
    // Only "you left this blank" errors are per-field. A credential failure
    // carries no `fields`, so it surfaces once, above the form.
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
        autoComplete="current-password"
        required
        value={values.password}
        error={fieldErrors.password}
        onChange={(event) => update('password', event.target.value)}
      />

      <Button type="submit" size="lg" disabled={submitting}>
        {submitting ? 'Signing in…' : 'Sign in'}
      </Button>

      <p className="text-sm text-ink-muted">
        New here?{' '}
        <Link href="/signup" className="font-medium text-ink underline">
          Create an account
        </Link>
      </p>
    </form>
  );
}

export default LoginForm;
