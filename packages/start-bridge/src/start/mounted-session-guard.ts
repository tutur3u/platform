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
export function normalizeSessionPath(path: string): string | null {
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

/**
 * The app-relative logout endpoint. On a mount it is forwarded to Web's
 * `/api/auth/logout` (one global logout), never served by the app.
 */
export function isMountedLogoutPath(appPath: string): boolean {
  return normalizeSessionPath(appPath) === '/api/auth/logout';
}

/**
 * The global logout forwarded from a mount answers with session-cookie
 * deletions, which a browser applies even to a cross-site top-level POST that
 * carried no cookie. So, unlike other mutations, it needs same-origin proof
 * whether or not a session cookie is present: `Sec-Fetch-Site: same-origin`,
 * or without Fetch Metadata an `Origin` equal to the request's own. Anything
 * but POST is refused. Returns `null` to continue.
 */
export function refuseCrossOriginMountedLogout(
  request: Request
): Response | null {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', {
      status: 405,
      headers: { Allow: 'POST', 'Cache-Control': 'no-store' },
    });
  }
  const site = request.headers.get('sec-fetch-site');
  const sameOrigin =
    site !== null
      ? site.toLowerCase() === 'same-origin'
      : request.headers.get('origin') === new URL(request.url).origin;
  if (sameOrigin) return null;
  return Response.json(
    { code: 'CSRF_REJECTED', error: 'Cross-origin request rejected' },
    { headers: { 'Cache-Control': 'no-store' }, status: 403 }
  );
}

/**
 * The terminal refusal for a mounted request to a session-minting endpoint:
 * no verification, rotation or `Set-Cookie`. Returns `null` for any other path.
 */
export function refuseMountedSessionMinting(appPath: string): Response | null {
  const path = normalizeSessionPath(appPath);
  if (path === null) {
    return isSessionNamespace(appPath)
      ? new Response('Bad Request', { status: 400 })
      : null;
  }
  if (!MOUNTED_SESSION_MINTING_PATHS.has(path)) {
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
