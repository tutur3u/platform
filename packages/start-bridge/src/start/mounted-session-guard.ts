import {
  APP_SESSION_COOKIE_NAME,
  APP_SESSION_REFRESH_COOKIE_NAME,
  WEB_APP_SESSION_COOKIE_NAME,
  WEB_APP_SESSION_REFRESH_COOKIE_NAME,
} from '@tuturuuu/auth/app-session-core';

/**
 * Mounted no-writer guard (docs: build/devops/start-bridge, "Mounted no-writer
 * guard"). On the shared `tuturuuu.com` origin the root session is the session:
 * a mounted app never mints, refreshes, writes or clears the per-app session
 * cookies. Those cookies are host-only with `Path=/`, so on the apex they would
 * collide across apps, and Web treats an apex `tuturuuu_app_session` as a
 * satellite marker and stops reading its own session.
 *
 * Mounted mode comes only from the bridge-resolved base (the URL), never from
 * a request header. Root (subdomain) requests are untouched.
 */

/** Per-app session cookies a mounted response may never set or clear. */
export const MOUNTED_FORBIDDEN_COOKIE_NAMES: ReadonlySet<string> = new Set([
  APP_SESSION_COOKIE_NAME,
  APP_SESSION_REFRESH_COOKIE_NAME,
  WEB_APP_SESSION_COOKIE_NAME,
  WEB_APP_SESSION_REFRESH_COOKIE_NAME,
]);

/** App-relative endpoints that mint or refresh a per-app session. */
export const MOUNTED_SESSION_MINTING_PATHS: ReadonlySet<string> = new Set([
  '/api/auth/verify-app-token',
  '/api/auth/refresh-app-session',
]);

function withoutTrailingSlash(path: string) {
  return path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;
}

/**
 * The app-relative logout endpoint. On a mount it is forwarded to Web's
 * `/api/auth/logout` (one global logout), never served by the app.
 */
export function isMountedLogoutPath(appPath: string): boolean {
  return withoutTrailingSlash(appPath) === '/api/auth/logout';
}

/**
 * The terminal refusal for a mounted request to a session-minting endpoint:
 * no verification, rotation or `Set-Cookie`. Returns `null` for any other path.
 */
export function refuseMountedSessionMinting(appPath: string): Response | null {
  if (!MOUNTED_SESSION_MINTING_PATHS.has(withoutTrailingSlash(appPath))) {
    return null;
  }
  return Response.json(
    {
      code: 'APP_SESSION_MOUNTED',
      error: 'Mounted apps use the shared tuturuuu.com session',
    },
    { headers: { 'Cache-Control': 'no-store' }, status: 409 }
  );
}

function cookieName(setCookie: string) {
  const equals = setCookie.indexOf('=');
  return (equals < 0 ? setCookie : setCookie.slice(0, equals)).trim();
}

/**
 * Whether a cookie name is a per-app session cookie, including the
 * `__Secure-`/`__Host-` prefixed and chunked (`name.0`, `name.1`) forms a
 * writer could emit.
 */
export function isMountedForbiddenCookieName(name: string): boolean {
  const unprefixed = name.replace(/^__(?:Secure|Host)-/u, '');
  const base = unprefixed.replace(/\.\d+$/u, '');
  return MOUNTED_FORBIDDEN_COOKIE_NAMES.has(base);
}

/**
 * Response backstop for mounted requests: drops every `Set-Cookie` (writes and
 * deletions) for the per-app session cookies, and `Service-Worker-Allowed` so
 * no mounted app can widen a service worker past its own base. Returns the
 * same response object when nothing needs to change.
 */
export function stripMountedSessionWrites(response: Response): Response {
  const setCookies = response.headers.getSetCookie();
  const kept = setCookies.filter(
    (value) => !isMountedForbiddenCookieName(cookieName(value))
  );
  const widensServiceWorker = response.headers.has('service-worker-allowed');
  if (kept.length === setCookies.length && !widensServiceWorker) {
    return response;
  }
  // A WebSocket upgrade cannot be re-wrapped without losing its socket, and
  // an upgrade response carries no session cookie from these writers.
  if (response.status === 101) return response;
  const result = new Response(response.body, response);
  result.headers.delete('set-cookie');
  for (const value of kept) result.headers.append('set-cookie', value);
  result.headers.delete('service-worker-allowed');
  return result;
}
