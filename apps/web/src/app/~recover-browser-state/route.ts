import {
  getAuthCookieName,
  getSupabaseAuthCookiePattern,
} from '@tuturuuu/supabase/next/common';
import { type NextRequest, NextResponse } from 'next/server';

const SUPABASE_AUTH_COOKIE_PATTERN = getSupabaseAuthCookiePattern();
const CLEAR_SITE_DATA_VALUE =
  '"cache", "cookies", "storage", "executionContexts"';

function getAuthCookieNames(request: NextRequest): string[] {
  return request.cookies
    .getAll()
    .map((cookie) => cookie.name)
    .filter(
      (cookieName) =>
        SUPABASE_AUTH_COOKIE_PATTERN.test(cookieName) ||
        (getAuthCookieName('') !== '' &&
          [
            'tuturuuu_app_session',
            'tuturuuu_web_app_session',
            'tuturuuu_app_session_refresh',
            'tuturuuu_web_app_session_refresh',
            'ttr_mfa_mobile_approval',
            '__Host-tuturuuu_web_account_device',
            'tuturuuu_web_account_device',
          ].some((name) => getAuthCookieName(name) === cookieName))
    );
}

function applyNoStoreHeaders(response: NextResponse) {
  response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  response.headers.set('CDN-Cache-Control', 'no-store');
}

function applyClearSiteDataHeaders(response: NextResponse) {
  applyNoStoreHeaders(response);
  response.headers.set(
    'Clear-Site-Data',
    getAuthCookieName('') === ''
      ? CLEAR_SITE_DATA_VALUE
      : '"cache", "storage", "executionContexts"'
  );
}

function isSameOriginRecoveryRequest(request: NextRequest) {
  const origin = request.headers.get('origin');
  if (origin) {
    try {
      return new URL(origin).origin === request.nextUrl.origin;
    } catch {
      return false;
    }
  }

  const referer = request.headers.get('referer');
  if (!referer) {
    return false;
  }

  try {
    return new URL(referer).origin === request.nextUrl.origin;
  } catch {
    return false;
  }
}

export async function GET(): Promise<NextResponse> {
  const response = new NextResponse(
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Reset Browser State</title>
  </head>
  <body>
    <main>
      <h1>Reset browser state</h1>
      <p>This clears cached Tuturuuu browser data and returns you to login.</p>
      <form method="post" action="/~recover-browser-state">
        <button type="submit">Reset browser state</button>
      </form>
    </main>
  </body>
</html>`,
    {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
      },
      status: 200,
    }
  );

  applyNoStoreHeaders(response);
  return response;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isSameOriginRecoveryRequest(request)) {
    const response = NextResponse.json(
      { error: 'Browser state reset requires same-origin confirmation' },
      { status: 403 }
    );
    applyNoStoreHeaders(response);
    return response;
  }

  const redirectUrl = new URL('/login?browserStateReset=1', request.nextUrl);
  const response = NextResponse.redirect(redirectUrl);

  applyClearSiteDataHeaders(response);

  for (const cookieName of getAuthCookieNames(request)) {
    response.cookies.set(cookieName, '', {
      ...(cookieName.startsWith('__Host-') || cookieName.startsWith('__Secure-')
        ? { secure: true }
        : {}),
      expires: new Date(0),
      maxAge: 0,
      path: '/',
    });
  }

  return response;
}
