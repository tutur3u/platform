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

export function appLogoutFenceResponse(
  request: NextRequest,
  loginUrl: () => URL
): NextResponse | null {
  if (!hasAppLogoutFence(request)) return null;
  const path =
    request.nextUrl.pathname.replace(/^\/(en|vi)(?=\/|$)/u, '') || '/';
  if (
    [
      '/verify-token',
      '/api/auth/verify-app-token',
      '/api/auth/logout',
    ].includes(path)
  )
    return null;
  if (path.startsWith('/api/'))
    return NextResponse.json({ error: 'App signed out' }, { status: 401 });
  const destination = loginUrl();
  destination.searchParams.set('confirmAccount', '1');
  const response = NextResponse.redirect(destination);
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
