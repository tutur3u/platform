import {
  clearSupabaseAuthCookies,
  hasSupportedSupabaseAuthCookie,
  hasWebAppSessionTokenFromRequest,
} from '@tuturuuu/auth/app-session';
import {
  normalizeAuthRedirectPath,
  propagateAuthCookies,
  refreshAppSessionForRequest,
} from '@tuturuuu/auth/proxy';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { BASE_URL, WEB_APP_URL } from './constants/common';

// Resolve login before rendering starts so HTTP clients receive a Location header.
export async function getLoginRedirect(request: NextRequest) {
  const nextPath = normalizeAuthRedirectPath(
    request.nextUrl.searchParams.get('next'),
    BASE_URL,
    '/'
  );
  const session =
    request.nextUrl.searchParams.get('refresh') === '1'
      ? null
      : await refreshAppSessionForRequest(request, {
          requireWebAppSession: true,
          sessionMode: 'supabase-first',
          targetApp: 'lettin',
        });
  const verifiedRequest = {
    headers: session?.ok
      ? (session.requestHeaders ?? request.headers)
      : request.headers,
  };
  const hasSharedSession =
    hasWebAppSessionTokenFromRequest(verifiedRequest) ||
    hasSupportedSupabaseAuthCookie(verifiedRequest);
  const returnUrl = new URL('/verify-token', BASE_URL);
  returnUrl.searchParams.set('nextUrl', nextPath);
  const loginUrl = new URL('/login', WEB_APP_URL);
  loginUrl.searchParams.set('returnUrl', returnUrl.toString());
  const response = NextResponse.redirect(
    session?.ok && hasSharedSession ? new URL(nextPath, BASE_URL) : loginUrl
  );
  if (session?.response) propagateAuthCookies(session.response, response);
  return clearSupabaseAuthCookies(request, response);
}
