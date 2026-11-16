import { guardRejection } from '@tuturuuu/utils/guard-rejection';
import { type NextRequest, NextResponse } from 'next/server';
import { appSessionFailureResponse } from './mfa-failure';

const PRIVATE_NO_STORE = 'private, no-store';
const ASSURANCE_ERRORS = new Set([
  'App session refresh unavailable',
  'MFA required',
  'Account assurance unavailable',
]);

/** Whether a Set-Cookie value deletes or expires the cookie it names. An
 * unreadable `Max-Age` or `Expires` counts as expiring, so it is dropped. */
export function isExpiringSetCookie(value: string, now = Date.now()) {
  for (const attribute of value.split(';').slice(1)) {
    const separator = attribute.indexOf('=');
    const name = (separator < 0 ? attribute : attribute.slice(0, separator))
      .trim()
      .toLowerCase();
    const raw = separator < 0 ? '' : attribute.slice(separator + 1).trim();
    if (name === 'max-age') {
      const seconds = Number(raw);
      if (!raw || !Number.isFinite(seconds) || seconds <= 0) return true;
    }
    if (name === 'expires') {
      const expires = Date.parse(raw);
      if (Number.isNaN(expires) || expires <= now) return true;
    }
  }
  return false;
}

/** The storage key a Set-Cookie belongs to: the cookie name without a
 * trailing `.N` chunk index, so `sb-<ref>-auth-token` and its `.0`, `.1`
 * chunks share one key. */
export function setCookieStorageKey(value: string) {
  const pair = value.split(';', 1)[0] ?? '';
  const separator = pair.indexOf('=');
  return (separator < 0 ? pair : pair.slice(0, separator))
    .trim()
    .replace(/\.\d+$/u, '');
}

/**
 * The Set-Cookies a mounted response may send, in their original order: every
 * cookie write, and a deletion only when the same list writes a cookie with the
 * same storage key. A session rewrite that changes chunking (`name` to
 * `name.0`/`name.1`, or fewer chunks) must expire the stale form, or the old
 * and new chunks combine into a corrupt session. A deletion for a key the list
 * does not write is a Web-owned cookie the mount never expires.
 */
export function mountedSetCookies(cookies: string[], now = Date.now()) {
  const written = new Set<string>();
  for (const cookie of cookies)
    if (!isExpiringSetCookie(cookie, now)) {
      const key = setCookieStorageKey(cookie);
      if (key) written.add(key);
    }
  return cookies.filter(
    (cookie) =>
      !isExpiringSetCookie(cookie, now) ||
      written.has(setCookieStorageKey(cookie))
  );
}

/** Remove every Set-Cookie on `response` that deletes or expires a cookie the
 * response does not also rewrite (see `mountedSetCookies`). */
export function withoutExpiringCookies<T extends Response>(response: T): T {
  const cookies = response.headers.getSetCookie();
  const kept = mountedSetCookies(cookies);
  if (kept.length === cookies.length) return response;
  response.headers.delete('set-cookie');
  for (const cookie of kept) response.headers.append('set-cookie', cookie);
  return response;
}

/** A carrier holding the cookie writes of `source` and the deletions of stale
 * chunks of the keys it rewrites, never any other deletion. */
export function nonExpiringCookieCarrier(source?: Response | null) {
  const headers = new Headers();
  for (const cookie of mountedSetCookies(source?.headers.getSetCookie() ?? []))
    headers.append('set-cookie', cookie);
  return new NextResponse(null, { headers });
}

/**
 * The refusal for a session failure inside an app mounted on the apex
 * (`https://tuturuuu.com/<app>`). The shared provider cookies there belong to
 * Web, so this response never clears or expires a cookie it does not rewrite:
 * it carries only a provider cookie that a refresh rewrote, plus that
 * rewrite's stale-chunk deletions. It is always `private, no-store`.
 */
export function mountedSessionFailureResponse(
  request: NextRequest,
  error: string,
  refreshed?: Response | null
): NextResponse {
  const response = ASSURANCE_ERRORS.has(error)
    ? appSessionFailureResponse(
        request,
        error,
        nonExpiringCookieCarrier(refreshed)
      )
    : guardRejection(
        request,
        NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
        'app-session-unauthenticated'
      );
  response.headers.set('Cache-Control', PRIVATE_NO_STORE);
  return withoutExpiringCookies(response);
}
