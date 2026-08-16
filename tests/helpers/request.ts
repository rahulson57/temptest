import { NextRequest } from 'next/server';
import type { ApiResponse } from '@/lib/api';
import { sessionCookieFor, type SessionUserLike } from './auth';

/**
 * Route-handler invocation helpers.
 *
 * Route handlers are plain functions of (Request, context). Calling them
 * directly is far faster than booting a server, and it exercises the real
 * validation, auth and envelope code.
 */

export type RouteContext<P extends Record<string, string> = Record<string, string>> = {
  params: Promise<P>;
};

export type BuildRequestOptions = {
  method?: string;
  /** Serialized as a JSON body with the right content-type. */
  body?: unknown;
  /** Appended to the URL as a query string. */
  query?: Record<string, string | number | undefined>;
  headers?: HeadersInit;
  /** Attaches a signed session cookie for this user. */
  user?: SessionUserLike;
  /** Raw cookie header, when you need something `user` can't express. */
  cookie?: string;
};

const ORIGIN = 'http://localhost:3000';

/** Build a NextRequest for `path`, optionally authenticated as `user`. */
export async function buildRequest(
  path: string,
  options: BuildRequestOptions = {},
): Promise<NextRequest> {
  const url = new URL(path, ORIGIN);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  const headers = new Headers(options.headers);
  if (options.body !== undefined && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }

  const cookie = options.cookie ?? (options.user ? await sessionCookieFor(options.user) : undefined);
  if (cookie) headers.set('cookie', cookie);

  const method = options.method ?? (options.body !== undefined ? 'POST' : 'GET');

  return new NextRequest(url, {
    method,
    headers,
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  });
}

/** Route context whose `params` promise resolves to the given values (Next 15 shape). */
export function routeContext<P extends Record<string, string>>(params: P): RouteContext<P> {
  return { params: Promise.resolve(params) };
}

export type RouteResult<T> = {
  status: number;
  body: ApiResponse<T>;
  headers: Headers;
};

/** Invoke a handler and parse the JSON envelope out of its Response. */
export async function callRoute<T = unknown>(
  handler: (request: NextRequest, context: never) => Promise<Response> | Response,
  request: NextRequest,
  context?: unknown,
): Promise<RouteResult<T>> {
  const response = await handler(request, context as never);
  const text = await response.text();
  return {
    status: response.status,
    headers: response.headers,
    body: (text ? JSON.parse(text) : null) as ApiResponse<T>,
  };
}

/** Narrow a route result to its success payload, failing loudly otherwise. */
export function expectOk<T>(result: RouteResult<T>): T {
  if (!result.body || result.body.ok !== true) {
    throw new Error(
      `Expected an ok envelope, got ${result.status}: ${JSON.stringify(result.body)}`,
    );
  }
  return result.body.data;
}

/**
 * Cookie-store double for handlers that call `cookies()` from 'next/headers'.
 *
 * `next/headers` reads request-scoped AsyncLocalStorage that only exists inside
 * a real Next request, so a handler using getCurrentUser()/createSession() must
 * mock the module. At the TOP of such a test file:
 *
 *   const cookieStore = createCookieStoreMock();
 *   vi.mock('next/headers', () => ({ cookies: async () => cookieStore }));
 *
 * then `cookieStore.set('session', await sessionTokenFor(user))` before the call.
 */
export function createCookieStoreMock(initial: Record<string, string> = {}) {
  const jar = new Map<string, string>(Object.entries(initial));
  return {
    get(name: string) {
      const value = jar.get(name);
      return value === undefined ? undefined : { name, value };
    },
    getAll() {
      return [...jar.entries()].map(([name, value]) => ({ name, value }));
    },
    has(name: string) {
      return jar.has(name);
    },
    set(name: string, value: string) {
      jar.set(name, value);
    },
    delete(name: string) {
      jar.delete(name);
    },
    clear() {
      jar.clear();
    },
  };
}
