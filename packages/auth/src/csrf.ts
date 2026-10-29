import { stripAuthCookiePrefix } from '@tuturuuu/supabase/next/common';
/**
 * Framework-free CSRF check for cookie-authenticated mutations.
 *
 * Adapters (Next middleware, the Start bridge, a Worker) pass the request
 * method, pathname, headers, the request's own allowed origins, an exemption
 * registry and the mode they resolved from their own configuration.
 */

export type CsrfMode = 'off' | 'report' | 'enforce';

export interface CsrfHeaders {
  get(name: string): string | null;
}

export interface CsrfExemption {
  /** Exact pathname, or a prefix when it ends with `/`. */
  pathname: string;
  /** Unsafe methods the exemption covers; all unsafe methods when omitted. */
  methods?: readonly string[];
  /** Why the route is safe without this check (for example, its own signature). */
  reason: string;
}

export interface CsrfCheckInput {
  method: string;
  pathname: string;
  headers: CsrfHeaders;
  /** Origins that count as this request's own, e.g. `https://tuturuuu.com`. */
  allowedOrigins: readonly string[];
  exemptions?: readonly CsrfExemption[];
  isSessionCookieName?: (name: string) => boolean;
}

export type CsrfAllowReason =
  | 'safe-method'
  | 'bearer'
  | 'no-session-cookie'
  | 'exempt'
  | 'same-origin'
  | 'origin-match';

export type CsrfRejectReason =
  | 'same-site'
  | 'cross-site'
  | 'fetch-site-none'
  | 'unknown-fetch-site'
  | 'missing-origin'
  | 'null-origin'
  | 'origin-mismatch';

export type CsrfVerdict =
  | { ok: true; reason: CsrfAllowReason }
  | {
      ok: false;
      reason: CsrfRejectReason;
      origin: string | null;
      secFetchSite: string | null;
    };

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function parseCsrfMode(value: string | null | undefined): CsrfMode {
  const normalized = value?.trim().toLowerCase();
  return normalized === 'report' || normalized === 'enforce'
    ? normalized
    : 'off';
}

/** Supabase auth cookies (and chunks) and Tuturuuu app-session cookies. */
export function isDefaultSessionCookieName(cookieName: string) {
  const name = stripAuthCookiePrefix(cookieName) ?? cookieName;
  if (name.endsWith('-code-verifier')) return false;

  const supabaseName = name.startsWith('__Host-') ? name.slice(7) : name;
  return (
    (supabaseName.startsWith('sb-') && supabaseName.includes('-auth-token')) ||
    name.startsWith('tuturuuu_app_session') ||
    name.startsWith('tuturuuu_web_app_session')
  );
}

function hasSessionCookie(
  cookieHeader: string | null,
  isSessionCookieName: (name: string) => boolean
) {
  if (!cookieHeader) return false;

  return cookieHeader.split(';').some((pair) => {
    const name = pair.split('=', 1)[0]?.trim();
    return Boolean(name) && isSessionCookieName(name as string);
  });
}

function isExempt(
  method: string,
  pathname: string,
  exemptions: readonly CsrfExemption[]
) {
  return exemptions.some(
    (exemption) =>
      (exemption.pathname.endsWith('/')
        ? pathname.startsWith(exemption.pathname)
        : pathname === exemption.pathname) &&
      (!exemption.methods || exemption.methods.includes(method))
  );
}

function normalizeOrigin(value: string) {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

export function checkCsrf(input: CsrfCheckInput): CsrfVerdict {
  const method = input.method.toUpperCase();
  if (SAFE_METHODS.has(method)) return { ok: true, reason: 'safe-method' };

  const authorization = input.headers.get('authorization');
  if (authorization && /^bearer\s+\S/iu.test(authorization)) {
    return { ok: true, reason: 'bearer' };
  }

  if (
    !hasSessionCookie(
      input.headers.get('cookie'),
      input.isSessionCookieName ?? isDefaultSessionCookieName
    )
  ) {
    return { ok: true, reason: 'no-session-cookie' };
  }

  if (isExempt(method, input.pathname, input.exemptions ?? [])) {
    return { ok: true, reason: 'exempt' };
  }

  const secFetchSite = input.headers.get('sec-fetch-site');
  const origin = input.headers.get('origin');
  const reject = (reason: CsrfRejectReason): CsrfVerdict => ({
    ok: false,
    origin,
    reason,
    secFetchSite,
  });

  if (secFetchSite !== null) {
    switch (secFetchSite.toLowerCase()) {
      case 'same-origin':
        return { ok: true, reason: 'same-origin' };
      case 'same-site':
        return reject('same-site');
      case 'cross-site':
        return reject('cross-site');
      case 'none':
        return reject('fetch-site-none');
      default:
        return reject('unknown-fetch-site');
    }
  }

  if (origin === null) return reject('missing-origin');
  if (origin === 'null') return reject('null-origin');

  const requestOrigin = normalizeOrigin(origin);
  const allowed = input.allowedOrigins.some(
    (allowedOrigin) =>
      requestOrigin !== null && normalizeOrigin(allowedOrigin) === requestOrigin
  );

  return allowed
    ? { ok: true, reason: 'origin-match' }
    : reject('origin-mismatch');
}

/**
 * Bounds report logging: each key (e.g. route + reason + origin) is reported
 * at most once per interval, and the tracked key set stays bounded, so a flood
 * of failing requests cannot flood the logs. One limiter per isolate.
 */
export function createCsrfReportLimiter({
  intervalMs = 60_000,
  maxKeys = 1_000,
}: {
  intervalMs?: number;
  maxKeys?: number;
} = {}) {
  const lastReportedAt = new Map<string, number>();

  return (key: string, now = Date.now()) => {
    const last = lastReportedAt.get(key);
    if (last !== undefined && now - last < intervalMs) return false;

    if (!lastReportedAt.has(key) && lastReportedAt.size >= maxKeys) {
      for (const [entry, at] of lastReportedAt) {
        if (now - at >= intervalMs) lastReportedAt.delete(entry);
      }
      if (lastReportedAt.size >= maxKeys) return false;
    }

    lastReportedAt.set(key, now);
    return true;
  };
}
