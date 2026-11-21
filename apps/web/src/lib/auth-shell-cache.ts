import {
  SUPABASE_AUTH_COOKIE_PATTERN,
  WEB_APP_SESSION_COOKIE_NAME,
  WEB_APP_SESSION_REFRESH_COOKIE_NAME,
} from '@tuturuuu/auth/app-session-core';
import type { NextRequest, NextResponse } from 'next/server';

export const CACHEABLE_AUTH_SHELL_PATHS = new Set(['/add-account', '/login']);
const AUTH_SHELL_BROWSER_CACHE_CONTROL = 'public, max-age=0, must-revalidate';
const AUTH_SHELL_CDN_CACHE_CONTROL =
  'public, max-age=86400, stale-while-revalidate=604800';
const PRIVATE_AUTH_SHELL_CACHE_CONTROL = 'private, no-store';

/**
 * The login and add-account shells are shared CDN pages only when the
 * request carries no session cookie. The locale layout renders the
 * session user into its providers, so a signed-in render is private and
 * never stored; a cached anonymous shell carries no identity.
 */
export function applyAuthShellCacheHeaders(
  req: Pick<NextRequest, 'cookies'>,
  response: NextResponse
): NextResponse {
  const hasAuthCookie = req.cookies
    .getAll()
    .some(
      ({ name }) =>
        SUPABASE_AUTH_COOKIE_PATTERN.test(name) ||
        name === WEB_APP_SESSION_COOKIE_NAME ||
        name === WEB_APP_SESSION_REFRESH_COOKIE_NAME
    );

  if (hasAuthCookie) {
    response.headers.set('Cache-Control', PRIVATE_AUTH_SHELL_CACHE_CONTROL);
    response.headers.set('CDN-Cache-Control', 'no-store');
    response.headers.set('Vercel-CDN-Cache-Control', 'no-store');
  } else {
    response.headers.set('Cache-Control', AUTH_SHELL_BROWSER_CACHE_CONTROL);
    response.headers.set('CDN-Cache-Control', AUTH_SHELL_CDN_CACHE_CONTROL);
    response.headers.set(
      'Vercel-CDN-Cache-Control',
      AUTH_SHELL_CDN_CACHE_CONTROL
    );
  }
  response.headers.set('X-Robots-Tag', 'noindex, nofollow');

  return response;
}
