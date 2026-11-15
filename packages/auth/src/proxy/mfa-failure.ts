import { guardRejection } from '@tuturuuu/utils/guard-rejection';
import { type NextRequest, NextResponse } from 'next/server';
import { clearSupabaseAuthCookies } from '../app-session';

const UNAVAILABLE_RETRY_AFTER_SECONDS = '30';

// Static markup only: no request-derived value (URL, header, error text) is
// ever interpolated, so the page cannot reflect or redirect anywhere. The
// empty href reloads the exact current URL.
const UNAVAILABLE_PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Sign-in temporarily unavailable</title>
<style>
body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui,-apple-system,sans-serif;background:#fff;color:#111}
@media (prefers-color-scheme:dark){body{background:#0b0b0c;color:#eee}a{color:#9ec5ff}}
main{max-width:28rem;padding:2rem 1.5rem;text-align:center}
h1{font-size:1.25rem;margin:0 0 .75rem}p{line-height:1.5;margin:0 0 1.5rem}
a{display:inline-block;padding:.6rem 1.2rem;border-radius:.5rem;border:1px solid currentColor;text-decoration:none;color:#0b5cff}
</style>
</head>
<body>
<main>
<h1>Sign-in is temporarily unavailable</h1>
<p>We could not confirm your session right now. You are still signed in; please try again in a moment.</p>
<a href="">Try again</a>
</main>
</body>
</html>
`;

/**
 * A top-level page load (a person opening a link or reloading) rather than an
 * API, fetch or form call. Browsers mark navigations with Fetch Metadata; for
 * clients without it, only a GET/HEAD that asks for HTML counts.
 */
function isDocumentNavigation(request: NextRequest) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return false;
  if (request.nextUrl.pathname.startsWith('/api')) return false;
  const mode = request.headers.get('sec-fetch-mode');
  if (mode !== null) return mode === 'navigate';
  return (request.headers.get('accept') ?? '').includes('text/html');
}

/** A 503 a browser renders instead of downloading JSON as a file. */
function unavailablePage() {
  return new NextResponse(UNAVAILABLE_PAGE, {
    status: 503,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'text/html; charset=utf-8',
      'Retry-After': UNAVAILABLE_RETRY_AFTER_SECONDS,
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

/** Keep the authenticated session available for enrollment/challenge. Clearing
 * it on MFA_REQUIRED causes a password-login loop and loses mobile approvals.
 * The two transient "unavailable" outcomes render an HTML page for document
 * navigations (iOS downloads a JSON 503 as a file) and keep the JSON body for
 * API, fetch and form callers. A login redirect would loop, because the
 * central session is still valid and lands back here. */
export function appSessionFailureResponse(
  request: NextRequest,
  error: string,
  refreshed?: Response
) {
  if (error === 'App session refresh unavailable') {
    if (isDocumentNavigation(request))
      return guardRejection(
        request,
        unavailablePage(),
        'app-session-refresh-unavailable'
      );
    return guardRejection(
      request,
      NextResponse.json(
        {
          code: 'APP_SESSION_REFRESH_UNAVAILABLE',
          error: 'App session refresh temporarily unavailable',
        },
        { status: 503, headers: { 'Cache-Control': 'no-store' } }
      ),
      'app-session-refresh-unavailable'
    );
  }
  if (error === 'MFA required' || error === 'Account assurance unavailable') {
    const required = error === 'MFA required';
    if (!required && isDocumentNavigation(request)) {
      const page = guardRejection(
        request,
        unavailablePage(),
        'auth-assurance-unavailable'
      );
      page.headers.set('X-Tuturuuu-Auth-Assurance', 'unavailable');
      for (const cookie of refreshed?.headers.getSetCookie() ?? [])
        page.headers.append('set-cookie', cookie);
      return page;
    }
    const response = guardRejection(
      request,
      NextResponse.json(
        {
          code: required ? 'MFA_REQUIRED' : 'AUTH_UNAVAILABLE',
          error: required
            ? 'MFA verification required'
            : 'Unable to verify account security',
        },
        {
          status: required ? 403 : 503,
          headers: {
            'Cache-Control': 'no-store',
            'X-Tuturuuu-Auth-Assurance': required ? 'required' : 'unavailable',
          },
        }
      ),
      required ? 'auth-assurance-required' : 'auth-assurance-unavailable'
    );
    for (const cookie of refreshed?.headers.getSetCookie() ?? [])
      response.headers.append('set-cookie', cookie);
    return response;
  }
  return guardRejection(
    request,
    clearSupabaseAuthCookies(
      request,
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    ),
    'app-session-unauthenticated'
  );
}

export function preserveMfaRecoveryCookies(
  request: NextRequest,
  response: NextResponse
) {
  return response.headers.has('X-Tuturuuu-Auth-Assurance')
    ? response
    : clearSupabaseAuthCookies(request, response);
}
