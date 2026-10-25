import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { clearSupabaseAuthCookies } from '../app-session';
import { withRequestBasePath } from './redirect-path';

/** Redirects for the satellite `verify-token` handshake; all stay in the app's basePath. */

export async function readVerifyTokenResponse(response: Response) {
  return response.json().catch(() => null) as Promise<{
    appSessionCreated?: unknown;
    userId?: unknown;
    valid?: unknown;
  } | null>;
}

export function redirectToNormalizedVerifyTarget(
  req: NextRequest,
  nextPath: string
) {
  return NextResponse.redirect(
    new URL(withRequestBasePath(req, nextPath), req.nextUrl)
  );
}

export function redirectToVerifyFallback(
  req: NextRequest,
  fallbackPath: string,
  response?: NextResponse
) {
  return clearSupabaseAuthCookies(
    req,
    response ??
      NextResponse.redirect(
        new URL(withRequestBasePath(req, fallbackPath), req.nextUrl)
      )
  );
}

export function matchesVerifyTokenPath(
  pathname: string,
  options: { locales?: readonly string[]; verifyPath?: string }
) {
  const verifyPath = options.verifyPath ?? '/verify-token';

  if (pathname === verifyPath) {
    return true;
  }

  const locales = options.locales ?? [];
  if (locales.length === 0) {
    return false;
  }

  const segments = pathname.split('/').filter(Boolean);
  const verifySegment = verifyPath.replace(/^\/+/u, '');
  return (
    segments.length === 2 &&
    segments[1] === verifySegment &&
    locales.includes(segments[0] ?? '')
  );
}
