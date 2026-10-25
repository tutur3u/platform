/**
 * Mounted (apex) app-session policy, framework- and runtime-independent.
 *
 * When an app is mounted under a shared origin (`tuturuuu.com/<app>`), the
 * shared session is the root (central) session: no app may write, refresh or
 * clear `tuturuuu_app_session*` / `tuturuuu_web_app_session*` there. Whether
 * the current request is mounted is decided by a server-side resolver that
 * the runtime adapter installs (the start bridge installs one that reads its
 * URL-derived request context). Auth code never reads a request header for
 * this: a client cannot switch a request in or out of mounted mode.
 *
 * Resolvers only add restrictions: a request is mounted when any installed
 * resolver says so, so a later install cannot re-enable mounted writes.
 * With no resolver installed (Next-hosted satellites, root mode) every
 * writer behaves exactly as before.
 */
import {
  APP_SESSION_COOKIE_NAME,
  APP_SESSION_REFRESH_COOKIE_NAME,
  WEB_APP_SESSION_COOKIE_NAME,
  WEB_APP_SESSION_REFRESH_COOKIE_NAME,
} from './app-session-core';

export type MountedAppSessionResolver = () => boolean;

const RESOLVERS_KEY = Symbol.for('tuturuuu.auth.mounted-app-session');
type Anchor = { [RESOLVERS_KEY]?: Set<MountedAppSessionResolver> };

/** Shared across bundled copies (SSR, RSC) through a global Symbol. */
function resolvers() {
  const anchor = globalThis as Anchor;
  anchor[RESOLVERS_KEY] ??= new Set();
  return anchor[RESOLVERS_KEY];
}

export function installMountedAppSessionResolver(
  resolver: MountedAppSessionResolver
) {
  resolvers().add(resolver);
}

/** True when the current server-side request is served under an apex mount. */
export function isMountedAppSessionRequest() {
  for (const resolve of resolvers()) {
    try {
      if (resolve()) return true;
    } catch {
      // A failing resolver must not decide; the others still apply.
    }
  }
  return false;
}

/** Every app-session cookie a mounted response must never set or clear. */
export const APP_SESSION_COOKIE_NAMES: ReadonlySet<string> = new Set([
  APP_SESSION_COOKIE_NAME,
  APP_SESSION_REFRESH_COOKIE_NAME,
  WEB_APP_SESSION_COOKIE_NAME,
  WEB_APP_SESSION_REFRESH_COOKIE_NAME,
]);

/** True for a `Set-Cookie` value that writes or clears an app-session cookie. */
export function isAppSessionSetCookie(setCookie: string) {
  const name = setCookie.slice(0, setCookie.indexOf('=')).trim();
  return APP_SESSION_COOKIE_NAMES.has(name);
}

export const MOUNTED_APP_SESSION_CODE = 'APP_SESSION_MOUNTED';

/**
 * Satellite session-minting endpoints (app-relative). Mounted requests to
 * them are refused before any verification, rotation or `Set-Cookie`.
 */
export const MOUNTED_APP_SESSION_REFUSED_PATHS: readonly string[] = [
  '/api/auth/verify-app-token',
  '/api/auth/refresh-app-session',
];

export function isMountedAppSessionRefusedPath(pathname: string) {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/u, '') : pathname;
  return MOUNTED_APP_SESSION_REFUSED_PATHS.includes(path);
}

/**
 * The `409` for a mounted session-minting request. The browser should use
 * the root session instead.
 *
 * TODO(apex-session model a): with the accepted Supabase apex session this
 * stays a terminal 409; CSP/Trusted Types enforcement is a mount admission
 * requirement owned by the bridge `csp` option, not this response.
 * TODO(apex-session model b): a BFF redesign would route here to the
 * server-side HttpOnly session exchange instead of refusing.
 */
export function mountedAppSessionRefusal() {
  return Response.json(
    {
      code: MOUNTED_APP_SESSION_CODE,
      error: 'App sessions are not issued under a shared-origin mount',
    },
    { status: 409, headers: { 'Cache-Control': 'no-store' } }
  );
}
