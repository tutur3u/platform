import {
  type CsrfExemption,
  type CsrfMode,
  checkCsrf,
  createCsrfReportLimiter,
  parseCsrfMode,
} from '@tuturuuu/auth/csrf';
import { type NextRequest, NextResponse } from 'next/server';

/**
 * Routes that may receive an unsafe cookie-bearing request from another site
 * and authenticate it on their own. Every entry needs a reason and a test.
 */
export const WEB_CSRF_EXEMPTIONS: readonly CsrfExemption[] = [
  {
    pathname: '/api/v1/webhooks/',
    reason: 'Provider webhooks are verified by their URL secret or signature',
  },
];

/**
 * Endpoints whose response clears the session cookies. They need same-origin
 * proof even without a session cookie, because a browser applies the cookie
 * deletions to a cross-site top-level POST that carried none.
 */
export const WEB_SESSION_CLEARING_PATHS: ReadonlySet<string> = new Set([
  '/api/auth/logout',
  '/api/v1/auth/accounts/logout',
  '/api/v1/auth/accounts/logout-all',
]);

/**
 * Origins of satellite apps whose `/api/*` requests are forwarded verbatim to
 * Web. A forwarded request arrives on Web's own host, so a client that sends
 * no `Sec-Fetch-Site` identifies itself by the satellite's `Origin` instead.
 * The `tuturuuu.com/<app>` mounts share Web's origin and need no entry.
 */
export const WEB_CSRF_TRUSTED_ORIGINS: readonly string[] = [
  'https://workspace.tuturuuu.com',
];

const shouldReportCsrfFailure = createCsrfReportLimiter();

/**
 * Web adapter for the framework-free CSRF check. The mode comes from
 * `TTR_CSRF_MODE` (`off` by default, then `report`, then `enforce`).
 */
export function guardWebApiCsrf(
  req: NextRequest,
  {
    configuredOrigin,
    mode = parseCsrfMode(process.env.TTR_CSRF_MODE),
  }: { configuredOrigin: string; mode?: CsrfMode }
): NextResponse | null {
  if (mode === 'off') return null;

  const verdict = checkCsrf({
    allowedOrigins: [
      req.nextUrl.origin,
      configuredOrigin,
      ...WEB_CSRF_TRUSTED_ORIGINS,
    ],
    // Web's credentialed CORS (the accounts API) admits every *.tuturuuu.com
    // origin, wider than this allowlist, so a bearer string never stands in
    // for proving the origin of a cookie-bearing mutation. Rolls out with
    // TTR_CSRF_MODE: hits are only reported until `enforce`.
    bearerRequiresNoSessionCookie: true,
    exemptions: WEB_CSRF_EXEMPTIONS,
    headers: req.headers,
    method: req.method,
    pathname: req.nextUrl.pathname,
    requireOriginWithoutSessionCookie: WEB_SESSION_CLEARING_PATHS.has(
      // `/api/auth/logout/` is the same endpoint.
      req.nextUrl.pathname.replace(/\/+$/u, '') || '/'
    ),
  });
  if (verdict.ok) return null;

  const reportKey = `${req.nextUrl.pathname}|${verdict.reason}|${verdict.origin}`;
  if (shouldReportCsrfFailure(reportKey)) {
    console.warn('CSRF check failed', {
      method: req.method,
      mode,
      origin: verdict.origin,
      reason: verdict.reason,
      route: req.nextUrl.pathname,
      secFetchSite: verdict.secFetchSite,
    });
  }

  if (mode === 'report') return null;

  return NextResponse.json(
    { code: 'CSRF_REJECTED', error: 'Cross-origin request rejected' },
    { status: 403 }
  );
}
