import type { Manifest, RouteMatch } from './manifest';

export const FRESH_SECONDS = 300;
export const STALE_SECONDS = 3600;

// Cookie names that can carry a session or credential. Sourced from the web
// proxy: Supabase auth cookies are `sb-<ref>-auth-token[.N]`
// (packages/utils api-proxy-guard), the locale cookie is `NEXT_LOCALE`.
const AUTH_COOKIE_PATTERNS = [
  /^sb-/i,
  /^supabase/i,
  /^tuturuuu/i,
  /^__(?:secure|host)-/i,
  /session/i,
  /auth/i,
  /token/i,
  /^sid$/i,
  /^jwt$/i,
  /csrf/i,
];

const TRACKING_PARAMS = /^(?:utm_[a-z_]+|fbclid|gclid|msclkid)$/i;

export function parseCookieNames(header: string | null): string[] {
  if (!header) return [];
  return header
    .split(';')
    .map((part) => part.split('=')[0]?.trim() ?? '')
    .filter(Boolean);
}

export function hasAuthCookie(header: string | null) {
  return parseCookieNames(header).some((name) =>
    AUTH_COOKIE_PATTERNS.some((pattern) => pattern.test(name))
  );
}

export type BypassReason =
  | 'method'
  | 'route'
  | 'authorization'
  | 'auth-cookie'
  | 'range'
  | 'rsc';

/**
 * Why a request must skip the cache, or null when it may be served from it.
 * Static assets ignore session cookies (their bytes never vary per user) but
 * still bypass on credentials headers.
 */
export function bypassReason(
  request: Request,
  match: RouteMatch
): BypassReason | null {
  if (request.method !== 'GET' && request.method !== 'HEAD') return 'method';
  if (match.cache === 'bypass') return 'route';
  if (request.headers.has('authorization')) return 'authorization';
  if (request.headers.has('range')) return 'range';
  if (
    request.headers.has('rsc') ||
    request.headers.has('next-router-prefetch') ||
    request.headers.has('next-router-state-tree') ||
    request.headers.has('next-action') ||
    new URL(request.url).searchParams.has('_rsc')
  ) {
    return 'rsc';
  }
  if (match.cache === 'page' && hasAuthCookie(request.headers.get('cookie'))) {
    return 'auth-cookie';
  }
  return null;
}

/**
 * Locale bucket for the cache key. The path prefix wins; otherwise the
 * `NEXT_LOCALE` cookie, then the first supported `Accept-Language` entry.
 * Only pages vary by locale.
 */
export function localeBucket(
  request: Request,
  match: RouteMatch,
  manifest: Manifest
) {
  if (match.cache !== 'page') return '-';
  if (match.locale) return match.locale;
  const cookies = request.headers.get('cookie') ?? '';
  const fromCookie = /(?:^|;\s*)NEXT_LOCALE=([^;]+)/.exec(cookies)?.[1];
  if (fromCookie && manifest.locales.includes(fromCookie)) return fromCookie;
  const languages = (request.headers.get('accept-language') ?? '')
    .split(',')
    .map((part) => part.split(';')[0]?.trim().toLowerCase() ?? '');
  for (const language of languages) {
    const base = language.split('-')[0] ?? '';
    if (manifest.locales.includes(base)) return base;
  }
  return manifest.locales[0] ?? '-';
}

export function normalizeUrl(url: URL) {
  const params = [...url.searchParams.entries()]
    .filter(([key]) => !TRACKING_PARAMS.test(key))
    .sort(([a, av], [b, bv]) =>
      a === b ? av.localeCompare(bv) : a.localeCompare(b)
    );
  const query = new URLSearchParams(params).toString();
  return `${url.protocol}//${url.host.toLowerCase()}${url.pathname}${query ? `?${query}` : ''}`;
}

/** HEAD reads the GET entry, so both methods share a key. */
export function cacheKey(request: Request, locale: string) {
  const method = request.method === 'HEAD' ? 'GET' : request.method;
  return `https://gateway-cache.invalid/${method}/${locale}/${encodeURIComponent(
    normalizeUrl(new URL(request.url))
  )}`;
}

/**
 * The Next locale middleware sets `NEXT_LOCALE` on every anonymous page. It only
 * records the locale already encoded in the cache key (path, cookie, then
 * Accept-Language), so a response whose Set-Cookie headers are all `NEXT_LOCALE`
 * is cache-safe. The stored copy drops it (see `storedCopy`); the response that
 * triggered the store keeps it.
 */
export function onlyLocaleCookies(response: Response) {
  const headers = response.headers as Headers & {
    getSetCookie?: () => string[];
  };
  const fromApi =
    typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : [];
  // Some runtimes expose the header only as one comma-joined string.
  const cookies = fromApi.length
    ? fromApi
    : (headers.get('set-cookie') ?? '')
        .split(/,(?=\s*[^;,=\s]+=)/)
        .filter((cookie) => cookie.trim());
  return (
    cookies.length > 0 &&
    cookies.every((cookie) => /^\s*NEXT_LOCALE=/i.test(cookie))
  );
}

export interface StoreDecision {
  store: boolean;
  reason?: string;
}

/** Whether an origin response may enter the cache. */
export function isStorable(
  response: Response,
  options: { respectOriginCacheControl: boolean }
): StoreDecision {
  if (response.status !== 200) return { store: false, reason: 'status' };
  if (response.headers.get('content-length')?.trim() === '0') {
    return { store: false, reason: 'empty-body' };
  }
  if (response.headers.has('set-cookie') && !onlyLocaleCookies(response)) {
    return { store: false, reason: 'set-cookie' };
  }
  if (response.headers.get('vary')?.includes('*')) {
    return { store: false, reason: 'vary' };
  }
  if (options.respectOriginCacheControl) {
    const control = response.headers.get('cache-control') ?? '';
    if (/\b(?:no-store|private)\b/i.test(control)) {
      return { store: false, reason: 'origin-cache-control' };
    }
  }
  return { store: true };
}

export type FreshnessState = 'hit' | 'stale' | 'expired';

export function freshness(storedAtMs: number, nowMs: number): FreshnessState {
  const age = (nowMs - storedAtMs) / 1000;
  if (age <= FRESH_SECONDS) return 'hit';
  if (age <= FRESH_SECONDS + STALE_SECONDS) return 'stale';
  return 'expired';
}

/** Largest asset the gateway buffers to compare its length with the origin's. */
export const VERIFY_BODY_MAX_BYTES = 8 * 1024 * 1024;

export type BodyProblem = 'empty-body' | 'truncated-body';

/**
 * Inspects an origin 200 for an asset before it can be stored. An empty body,
 * or fewer bytes than the origin declared, is never cached: the edge would
 * keep serving a broken file for the whole freshness window. Returns a
 * replacement response whose body is still readable.
 */
export async function inspectAssetBody(
  response: Response
): Promise<{ response: Response; problem: BodyProblem | null }> {
  const header = response.headers.get('content-length');
  const declared = header === null ? Number.NaN : Number(header);
  const encoded = (response.headers.get('content-encoding') ?? '')
    .trim()
    .toLowerCase();
  const identity = encoded === '' || encoded === 'identity';
  if (!response.body || declared === 0) {
    return { response, problem: 'empty-body' };
  }
  if (
    identity &&
    Number.isFinite(declared) &&
    declared <= VERIFY_BODY_MAX_BYTES
  ) {
    const bytes = await response.arrayBuffer();
    const problem =
      bytes.byteLength === 0
        ? 'empty-body'
        : bytes.byteLength !== declared
          ? 'truncated-body'
          : null;
    return { response: new Response(bytes, response), problem };
  }
  // Unknown or encoded length: only an empty stream can be detected up front.
  const reader = response.body.getReader();
  const first = await reader.read();
  if (first.done)
    return { response: new Response(null, response), problem: 'empty-body' };
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(first.value);
    },
    async pull(controller) {
      const next = await reader.read();
      if (next.done) controller.close();
      else controller.enqueue(next.value);
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });
  return { response: new Response(stream, response), problem: null };
}
