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

/** Remove every Set-Cookie on `response` that deletes or expires a cookie. */
export function withoutExpiringCookies<T extends Response>(response: T): T {
  const cookies = response.headers.getSetCookie();
  if (!cookies.some((cookie) => isExpiringSetCookie(cookie))) return response;
  response.headers.delete('set-cookie');
  for (const cookie of cookies)
    if (!isExpiringSetCookie(cookie))
      response.headers.append('set-cookie', cookie);
  return response;
}

/** A carrier holding only the cookie writes of `source`, never its deletions. */
export function nonExpiringCookieCarrier(source?: Response | null) {
  const headers = new Headers();
  for (const cookie of source?.headers.getSetCookie() ?? [])
    if (!isExpiringSetCookie(cookie)) headers.append('set-cookie', cookie);
  return new NextResponse(null, { headers });
}

/**
 * The refusal for a session failure inside an app mounted on the apex
 * (`https://tuturuuu.com/<app>`). The shared provider cookies there belong to
 * Web, so this response never clears or expires a cookie: it only carries a
 * provider cookie that a refresh rewrote. It is always `private, no-store`.
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
