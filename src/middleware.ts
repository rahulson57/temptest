import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE_NAME, verifySessionToken } from '@/lib/auth/session-token';

/**
 * Route protection.
 *
 * This is a FIRST GATE, not the security boundary: it keeps signed-out visitors
 * from loading authenticated shells and bounces them to /login with a return
 * path. Every route handler and server component must STILL call requireUser()
 * — middleware can be bypassed by anything that doesn't traverse it.
 *
 * Runs on the Edge runtime, so it may only import edge-safe modules
 * (jose, yes; bcryptjs and Prisma, no).
 */

/** Prefixes that require a session. */
const PROTECTED_PREFIXES = ['/write', '/reading-list', '/settings'] as const;

function isProtected(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (!isProtected(pathname)) return NextResponse.next();

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await verifySessionToken(token);
  if (session) return NextResponse.next();

  const loginUrl = new URL('/login', request.url);
  // Send users back where they were headed once they sign in.
  loginUrl.searchParams.set('next', `${pathname}${search}`);

  const response = NextResponse.redirect(loginUrl);
  // An expired or forged cookie should not survive the redirect.
  if (token) response.cookies.delete(SESSION_COOKIE_NAME);
  return response;
}

export const config = {
  matcher: ['/write/:path*', '/reading-list/:path*', '/settings/:path*'],
};
