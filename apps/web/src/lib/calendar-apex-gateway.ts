import { getLocalInternalAppUrl } from '@tuturuuu/utils/internal-domains';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

/**
 * Web-side safeguards for `tuturuuu.com/calendar` while Calendar moves to the
 * shared origin (zone routes live outside this repo). Both are OFF unless the
 * server env flag below is `1` or `true`, so production behavior is unchanged
 * by default:
 *
 * - `CALENDAR_APEX_FALLBACK_PROXY`: a zone route on the bare path
 *   `tuturuuu.com/calendar` does not match a request with a query string, so
 *   that request falls through to Web. Web proxies it (GET/HEAD only) to the
 *   Calendar upstream.
 * - `CALENDAR_APEX_SAFETY_NET`: single-step rollback. With the zone routes
 *   removed, every `tuturuuu.com/calendar/:path*` request reaches Web and is
 *   sent to the Calendar subdomain with a no-store 307.
 *
 * `/calendar/meet-together` is a Web page (and `proxy.ts` redirects it to
 * `/meet-together`), so neither safeguard ever touches it.
 */
export const CALENDAR_APEX_FALLBACK_PROXY_FLAG = 'CALENDAR_APEX_FALLBACK_PROXY';
export const CALENDAR_APEX_SAFETY_NET_FLAG = 'CALENDAR_APEX_SAFETY_NET';
/** Optional full upstream URL (origin plus mount path) for the fallback proxy. */
export const CALENDAR_APEX_UPSTREAM_URL_ENV = 'CALENDAR_APEX_UPSTREAM_URL';

const CALENDAR_BASE_PATH = '/calendar';
const MEET_TOGETHER_PATH = `${CALENDAR_BASE_PATH}/meet-together`;

type Env = Record<string, string | undefined>;

const FORWARDED_REQUEST_HEADERS = [
  'accept',
  'accept-language',
  'cookie',
  'if-modified-since',
  'if-none-match',
  'range',
] as const;

const BLOCKED_RESPONSE_HEADERS = new Set([
  'authorization',
  'connection',
  'content-encoding',
  'content-length',
  'cookie',
  'host',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'set-cookie',
  'te',
  'trailer',
  'trailers',
  'transfer-encoding',
  'upgrade',
]);

function flagEnabled(value: string | undefined) {
  const normalized = value?.trim().toLowerCase();
  return normalized === '1' || normalized === 'true';
}

export function isCalendarFallbackProxyEnabled(env: Env = process.env) {
  return flagEnabled(env[CALENDAR_APEX_FALLBACK_PROXY_FLAG]);
}

export function isCalendarSafetyNetEnabled(env: Env = process.env) {
  return flagEnabled(env[CALENDAR_APEX_SAFETY_NET_FLAG]);
}

/** The Calendar subdomain origin: never the apex mount, so it cannot loop. */
export function getCalendarSubdomainOrigin(env: Env = process.env) {
  return env.NODE_ENV === 'production'
    ? 'https://calendar.tuturuuu.com'
    : getLocalInternalAppUrl('calendar', 'http://localhost:7806');
}

/**
 * The static-asset extensions the general proxy matcher excludes. Keep in sync
 * with `config.matcher` in `proxy.ts` (a test compares the two).
 */
export const CALENDAR_STATIC_ASSET_EXTENSIONS =
  'svg|png|jpg|jpeg|mp3|wav|ogg|m4a|pdf|gif|webp';
const STATIC_ASSET_PATH = new RegExp(
  `\\.(?:${CALENDAR_STATIC_ASSET_EXTENSIONS})$`
);

/**
 * `/calendar/**` paths that the general matcher excludes (static assets). The
 * matcher lists `/calendar/:path*` on its own so the safety net can see them;
 * with the flag off they must behave exactly as before, which is to skip the
 * proxy entirely.
 */
export function isCalendarStaticAssetPath(pathname: string) {
  return isCalendarApexPath(pathname) && STATIC_ASSET_PATH.test(pathname);
}

/** Whether a pathname is Web's own `/calendar/meet-together` page tree. */
export function isCalendarMeetTogetherPath(pathname: string) {
  return (
    pathname === MEET_TOGETHER_PATH ||
    pathname.startsWith(`${MEET_TOGETHER_PATH}/`)
  );
}

/** `/calendar` or `/calendar/...` on a segment boundary (not `/calendar-team`). */
export function isCalendarApexPath(pathname: string) {
  return (
    pathname === CALENDAR_BASE_PATH ||
    pathname.startsWith(`${CALENDAR_BASE_PATH}/`)
  );
}

/**
 * Rollback safety net: `tuturuuu.com/calendar/:path*` to the Calendar
 * subdomain, same path inside the app and same query, 307 and never cached.
 */
export function handleCalendarSafetyNet(
  req: NextRequest,
  env: Env = process.env
): NextResponse | null {
  if (!isCalendarSafetyNetEnabled(env)) return null;

  const { pathname } = req.nextUrl;
  if (!isCalendarApexPath(pathname) || isCalendarMeetTogetherPath(pathname)) {
    return null;
  }

  const target = new URL(getCalendarSubdomainOrigin(env));
  // Assign the pathname (never parse it as a URL): `/calendar//evil.com` must
  // stay a path on the Calendar host, not a protocol-relative redirect.
  target.pathname = pathname.slice(CALENDAR_BASE_PATH.length) || '/';
  target.search = req.nextUrl.search;

  const response = NextResponse.redirect(target, 307);
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

function getFallbackUpstream(env: Env): URL | null {
  const configured = env[CALENDAR_APEX_UPSTREAM_URL_ENV]?.trim();
  const raw =
    configured || `${getCalendarSubdomainOrigin(env)}${CALENDAR_BASE_PATH}`;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    if (url.username || url.password) return null;
    return url;
  } catch {
    return null;
  }
}

function forwardedRequestHeaders(req: NextRequest): Headers {
  const headers = new Headers();
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = req.headers.get(name);
    if (value) headers.set(name, value);
  }
  return headers;
}

function upstreamResponseHeaders(upstream: Headers): Headers {
  const headers = new Headers();
  upstream.forEach((value, key) => {
    if (BLOCKED_RESPONSE_HEADERS.has(key) || key.startsWith('x-middleware')) {
      return;
    }
    headers.append(key, value);
  });
  // The request carried the visitor's cookies, so the answer is per visitor.
  headers.set('Cache-Control', 'private, no-store');
  return headers;
}

function noStore(status: number, extra: Record<string, string> = {}) {
  return new NextResponse(null, {
    status,
    headers: { 'Cache-Control': 'no-store', ...extra },
  });
}

/**
 * Bare `/calendar` WITH a query string only (the bare path alone is matched by
 * the zone route). GET and HEAD only, other methods get a 405. Redirects from
 * the upstream are passed through, never followed.
 */
export async function proxyCalendarBareQueryRequest(
  req: NextRequest,
  env: Env = process.env,
  fetchImpl: typeof fetch = globalThis.fetch
): Promise<NextResponse | null> {
  if (!isCalendarFallbackProxyEnabled(env)) return null;

  const { pathname, search } = req.nextUrl;
  const bare =
    pathname === CALENDAR_BASE_PATH || pathname === `${CALENDAR_BASE_PATH}/`;
  if (!bare || !search) return null;

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return noStore(405, { Allow: 'GET, HEAD' });
  }

  const upstream = getFallbackUpstream(env);
  // A misconfigured upstream that points back at this origin would loop.
  if (!upstream || upstream.origin === req.nextUrl.origin) {
    return noStore(502);
  }
  upstream.search = search;

  let upstreamResponse: Response;
  try {
    upstreamResponse = await fetchImpl(upstream, {
      cache: 'no-store',
      headers: forwardedRequestHeaders(req),
      method: req.method,
      redirect: 'manual',
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    return noStore(502);
  }

  const body =
    req.method === 'HEAD' ||
    upstreamResponse.status === 204 ||
    upstreamResponse.status === 304
      ? null
      : upstreamResponse.body;

  return new NextResponse(body, {
    headers: upstreamResponseHeaders(upstreamResponse.headers),
    status: upstreamResponse.status,
  });
}

/** Both safeguards in precedence order: the rollback redirect wins. */
export async function handleCalendarApexGateway(
  req: NextRequest
): Promise<NextResponse | null> {
  return (
    handleCalendarSafetyNet(req) ?? (await proxyCalendarBareQueryRequest(req))
  );
}
