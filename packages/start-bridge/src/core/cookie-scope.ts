/**
 * Per-app session cookie scoping for apps served under a shared origin
 * (`tuturuuu.com/<app>`). Every satellite writes the same canonical session
 * cookie names, so at the edge the bridge renames them to
 * `<canonical>__<app>` with `Path=/<app>` on the way out, and presents the
 * scoped value under the canonical name on the way in. App and auth code keep
 * using the canonical names unchanged.
 */

/** Canonical names written by `@tuturuuu/auth/app-session`. */
export const DEFAULT_SCOPED_COOKIES = [
  'tuturuuu_app_session',
  'tuturuuu_app_session_refresh',
] as const;

export interface CookieScope {
  readonly app: string;
  /** `/meet`; cookies are never scoped at the root. */
  readonly path: string;
  readonly names: readonly string[];
  /** Read an unscoped same-origin cookie when no scoped one exists yet. */
  readonly legacyFallback: boolean;
}

export function scopedCookieName(name: string, app: string) {
  return `${name}__${app}`;
}

function splitPair(part: string): [string, string] | null {
  const index = part.indexOf('=');
  if (index <= 0) return null;
  return [part.slice(0, index).trim(), part.slice(index + 1).trim()];
}

export interface PresentedCookies {
  header: string | null;
  /** Canonical names whose value came from a legacy unscoped cookie. */
  adopted: { name: string; value: string }[];
}

/**
 * Rewrites an incoming `Cookie` header: the scoped value is presented under
 * its canonical name, unscoped copies (another app's or the root's) are
 * dropped, and with `legacyFallback` the first unscoped value is retained
 * only when no scoped value exists. Auth still validates the token audience.
 */
export function presentScopedCookies(
  header: string | null,
  scope: CookieScope
): PresentedCookies {
  if (!header) return { header, adopted: [] };
  const scoped = new Map<string, string>();
  const legacy = new Map<string, string>();
  const rest: string[] = [];
  const byScopedName = new Map(
    scope.names.map((name) => [scopedCookieName(name, scope.app), name])
  );
  for (const raw of header.split(';')) {
    const part = raw.trim();
    const pair = splitPair(part);
    if (!pair) {
      if (part) rest.push(part);
      continue;
    }
    const [name, value] = pair;
    const canonical = byScopedName.get(name);
    if (canonical) {
      if (!scoped.has(canonical)) scoped.set(canonical, value);
    } else if (scope.names.includes(name)) {
      if (!legacy.has(name)) legacy.set(name, value);
    } else rest.push(part);
  }
  const adopted: PresentedCookies['adopted'] = [];
  const presented: string[] = [];
  for (const name of scope.names) {
    const value = scoped.get(name);
    if (value !== undefined) presented.push(`${name}=${value}`);
    else if (scope.legacyFallback && legacy.has(name)) {
      const legacyValue = legacy.get(name) ?? '';
      presented.push(`${name}=${legacyValue}`);
      if (legacyValue) adopted.push({ name, value: legacyValue });
    }
  }
  const joined = [...rest, ...presented].join('; ');
  return { header: joined || null, adopted };
}

/**
 * Renames a canonical `Set-Cookie` to the app's scoped name and forces
 * `Path=/<app>`. Clearing writes (empty value, expired) are scoped the same
 * way so logout clears exactly this app's cookie. Others pass unchanged.
 */
export function scopeSetCookie(setCookie: string, scope: CookieScope): string {
  const [first = '', ...attributes] = setCookie.split(';');
  const pair = splitPair(first);
  if (!pair || !scope.names.includes(pair[0])) return setCookie;
  const kept = attributes
    .map((attribute) => attribute.trim())
    .filter((attribute) => attribute && !/^path=/iu.test(attribute));
  return [
    `${scopedCookieName(pair[0], scope.app)}=${pair[1]}`,
    `Path=${scope.path}`,
    ...kept,
  ].join('; ');
}

function tokenExpiry(value: string): Date | null {
  const payload = value.split('.')[1];
  if (!payload) return null;
  try {
    const json = JSON.parse(
      atob(payload.replace(/-/gu, '+').replace(/_/gu, '/'))
    ) as { exp?: unknown };
    return typeof json.exp === 'number' && Number.isFinite(json.exp)
      ? new Date(json.exp * 1000)
      : null;
  } catch {
    return null;
  }
}

/**
 * Re-issues an adopted legacy value under the scoped name so the next request
 * no longer depends on the unscoped cookie. The expiry mirrors the token's own
 * `exp` claim when it is a JWT (read only for the cookie lifetime; auth still
 * verifies it), otherwise a browser-session cookie. The legacy cookie is never
 * deleted: it may belong to the root app or another app on the origin.
 */
export function adoptLegacyCookie(
  adopted: { name: string; value: string },
  scope: CookieScope,
  secure: boolean
): string {
  const expires = tokenExpiry(adopted.value);
  return [
    `${scopedCookieName(adopted.name, scope.app)}=${adopted.value}`,
    `Path=${scope.path}`,
    ...(expires ? [`Expires=${expires.toUTCString()}`] : []),
    'HttpOnly',
    'SameSite=Lax',
    ...(secure ? ['Secure'] : []),
  ].join('; ');
}
