import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { clearSupabaseAuthCookies } from '../app-session';
import { withRequestBasePath } from './redirect-path';

/** Redirects for the satellite `verify-token` handshake; all stay in the app's basePath. */

function uncachedRedirect(url: URL) {
  const response = NextResponse.redirect(url);
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}

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
  return uncachedRedirect(
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
      uncachedRedirect(
        new URL(withRequestBasePath(req, fallbackPath), req.nextUrl)
      )
  );
}
