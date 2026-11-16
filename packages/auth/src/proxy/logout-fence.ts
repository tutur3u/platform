import { type NextRequest, NextResponse } from 'next/server';
import { hasAppLogoutFence, type AppSessionRequest } from '../app-session-core';
import type { AppSessionRefreshState } from './signed-refresh';
export { hasAppLogoutFence } from '../app-session-core';

export async function withAppLogoutFence(
  request: AppSessionRequest,
  resolve: () => Promise<AppSessionRefreshState>
): Promise<AppSessionRefreshState> {
  if (hasAppLogoutFence(request)) return { ok: false, error: 'App signed out' };
  try {
    return await resolve();
  } catch {
    return { ok: false, error: 'Account assurance unavailable' };
  }
}

/** App-relative paths that stay reachable while the app is signed out. */
const APP_LOGOUT_FENCE_EXEMPT_PATHS = new Set([
  '/verify-token',
  '/api/auth/verify-app-token',
  '/api/auth/logout',
]);

/**
 * The app-relative, locale-free form of a request path for the fence. A
 * mounted app's base (`/hive`) is removed when the request was not already
 * built with it as Next `basePath` (where `nextUrl.pathname` is app-relative).
 */
export function appLogoutFencePath(pathname: string, basePath = ''): string {
  let path = pathname;
  if (basePath && (path === basePath || path.startsWith(`${basePath}/`)))
    path = path.slice(basePath.length) || '/';
  return path.replace(/^\/(en|vi)(?=\/|$)/u, '') || '/';
}

/** Whether a fenced request to this path is still allowed through. */
export function isAppLogoutFenceExemptPath(pathname: string, basePath = '') {
  const path = appLogoutFencePath(pathname, basePath);
  return APP_LOGOUT_FENCE_EXEMPT_PATHS.has(
    path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path
  );
}

export function appLogoutFenceResponse(
  request: NextRequest,
  loginUrl: () => URL,
  options: { basePath?: string } = {}
): NextResponse | null {
  if (!hasAppLogoutFence(request)) return null;
  // A request built with Next `basePath` already has an app-relative
  // pathname; otherwise the caller's mount base is stripped here.
  const basePath = request.nextUrl.basePath ? '' : (options.basePath ?? '');
  if (isAppLogoutFenceExemptPath(request.nextUrl.pathname, basePath))
    return null;
  const path = appLogoutFencePath(request.nextUrl.pathname, basePath);
  if (path.startsWith('/api/'))
    return NextResponse.json({ error: 'App signed out' }, { status: 401 });
  const destination = loginUrl();
  destination.searchParams.set('confirmAccount', '1');
  const response = NextResponse.redirect(destination);
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
