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
  /** Exact trusted origins, including the request's own origin. */
  allowedOrigins: readonly string[];
  exemptions?: readonly CsrfExemption[];
  isSessionCookieName?: (name: string) => boolean;
  /**
   * When true, an `Authorization: Bearer` header exempts only a request that
   * carries no session cookie. Set on a shared origin (`tuturuuu.com/<app>`
   * mounts), where an app may fall back to the cookie when a bearer token does
   * not authenticate, so a cross-origin request with the cookie and any
   * bearer string must still prove it is same-origin.
   */
  bearerRequiresNoSessionCookie?: boolean;
  /**
   * When true, a request without a session cookie still needs same-origin
   * proof (a cookie-less bearer request stays exempt). For endpoints such as
   * logout whose response clears session cookies: a browser applies those
   * deletions even to a cross-site top-level POST that carried no cookie.
   */
  requireOriginWithoutSessionCookie?: boolean;
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
export function isDefaultSessionCookieName(name: string) {
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
  const hasBearer = Boolean(
    authorization && /^bearer\s+\S/iu.test(authorization)
  );
  const hasCookie = hasSessionCookie(
    input.headers.get('cookie'),
    input.isSessionCookieName ?? isDefaultSessionCookieName
  );
  if (hasBearer && !(input.bearerRequiresNoSessionCookie && hasCookie)) {
    return { ok: true, reason: 'bearer' };
  }

  if (!hasCookie && !input.requireOriginWithoutSessionCookie) {
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

  // Compare parsed origins only; sibling hosts never inherit trust.
  const matchesAllowedOrigin = () => {
    const requestOrigin = origin === null ? null : normalizeOrigin(origin);
    return (
      requestOrigin !== null &&
      input.allowedOrigins.some(
        (allowedOrigin) => normalizeOrigin(allowedOrigin) === requestOrigin
      )
    );
  };

  if (secFetchSite !== null) {
    switch (secFetchSite.toLowerCase()) {
      case 'same-origin':
        return { ok: true, reason: 'same-origin' };
      case 'same-site':
        return matchesAllowedOrigin()
          ? { ok: true, reason: 'origin-match' }
          : reject('same-site');
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

  return matchesAllowedOrigin()
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
