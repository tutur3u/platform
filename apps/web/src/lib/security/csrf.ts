import {
  type CsrfExemption,
  type CsrfMode,
  checkCsrf,
  createCsrfReportLimiter,
  parseCsrfMode,
} from '@tuturuuu/auth/csrf';
import { getConfiguredInternalAppDomains } from '@tuturuuu/utils/internal-domains';
import { getConfiguredSharedCookieDomainOverride } from '@tuturuuu/utils/shared-cookie';
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
 * no `Sec-Fetch-Site` or `same-site` proves trust with its exact `Origin`.
 * Retiring a satellite removes its origin from this list.
 * The `tuturuuu.com/<app>` mounts share Web's origin and need no entry.
 */
export const WEB_CSRF_TRUSTED_ORIGINS: readonly string[] = [
  'https://ai.tuturuuu.com',
  'https://chat.tuturuuu.com',
  'https://colab.tuturuuu.com',
  'https://contacts.tuturuuu.com',
  'https://forms.tuturuuu.com',
  'https://git.tuturuuu.com',
  'https://infrastructure.tuturuuu.com',
  'https://inventory.tuturuuu.com',
  'https://learn.tuturuuu.com',
  'https://lettin.tuturuuu.com',
  'https://mind.tuturuuu.com',
  'https://nova.ai.vn',
  'https://nova.tuturuuu.com',
  'https://parley.tuturuuu.com',
  'https://pay.tuturuuu.com',
  'https://rewise.tuturuuu.com',
  'https://shortener.tuturuuu.com',
  'https://teach.tuturuuu.com',
  'https://workspace.tuturuuu.com',
];

function isSessionNamespace(path: string): boolean {
  const segments: string[] = [];
  for (const raw of path.split('/')) {
    let decoded = raw;
    try {
      decoded = decodeURIComponent(raw);
    } catch {
      // Retain the malformed segment while classifying its namespace.
    }
    for (const segment of decoded.split('/')) {
      if (!segment || segment === '.') continue;
      if (segment === '..') segments.pop();
      else segments.push(segment);
    }
  }
  const normalized = `/${segments.join('/')}`;
  return ['/api/auth', '/api/v1/auth/accounts'].some(
    (prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`)
  );
}

/** Decode once; residual escapes and URL delimiters are ambiguous. */
function normalizeSessionPath(path: string): string | null {
  try {
    const decoded = decodeURIComponent(path);
    if (/[%\\?#\u0000-\u001f\u007f]/u.test(decoded)) return null;
    const segments: string[] = [];
    for (const segment of decoded.split('/')) {
      if (!segment || segment === '.') continue;
      if (segment === '..') segments.pop();
      else segments.push(segment);
    }
    return `/${segments.join('/')}`;
  } catch {
    return null;
  }
}

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

  const sessionPath = normalizeSessionPath(req.nextUrl.pathname);
  if (
    mode === 'enforce' &&
    sessionPath === null &&
    isSessionNamespace(req.nextUrl.pathname)
  ) {
    return NextResponse.json(
      { code: 'CSRF_REJECTED', error: 'Ambiguous path' },
      { status: 403 }
    );
  }
  const verdict = checkCsrf({
    allowedOrigins: [
      req.nextUrl.origin,
      configuredOrigin,
      ...getWebCsrfTrustedOrigins(),
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
      sessionPath ?? req.nextUrl.pathname
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

/** Cookie-isolated staging trusts only explicitly configured staging satellites. */
export function getWebCsrfTrustedOrigins(): readonly string[] {
  if (!getConfiguredSharedCookieDomainOverride())
    return WEB_CSRF_TRUSTED_ORIGINS;

  const satelliteNames = new Set(
    WEB_CSRF_TRUSTED_ORIGINS.map(
      (origin) => new URL(origin).hostname.split('.')[0]
    )
  );
  return getConfiguredInternalAppDomains()
    .filter((app) => satelliteNames.has(app.name))
    .map((app) => app.url);
}
