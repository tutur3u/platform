import {
  type CsrfExemption,
  type CsrfMode,
  checkCsrf,
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
    allowedOrigins: [req.nextUrl.origin, configuredOrigin],
    exemptions: WEB_CSRF_EXEMPTIONS,
    headers: req.headers,
    method: req.method,
    pathname: req.nextUrl.pathname,
  });
  if (verdict.ok) return null;

  console.warn('CSRF check failed', {
    method: req.method,
    mode,
    origin: verdict.origin,
    reason: verdict.reason,
    route: req.nextUrl.pathname,
    secFetchSite: verdict.secFetchSite,
  });

  if (mode === 'report') return null;

  return NextResponse.json(
    { code: 'CSRF_REJECTED', error: 'Cross-origin request rejected' },
    { status: 403 }
  );
}
