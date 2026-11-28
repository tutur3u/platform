import { hasSupportedSupabaseAuthCookie } from '@tuturuuu/auth/app-session';
import { SHARED_APP_ORIGIN } from '@tuturuuu/utils/app-mounts';
import { type NextRequest, NextResponse } from 'next/server';

const ROOT_DESTINATIONS = new Map([
  ['/', '/products/ai'],
  ['/en', '/products/ai'],
  ['/en/', '/products/ai'],
  ['/vi', '/vi/products/ai'],
  ['/vi/', '/vi/products/ai'],
]);

/**
 * Web sends `tuturuuu.com/ai` to the AI product page. Once AI Studio is mounted
 * there, a signed-out visit to the mount root keeps that destination. A request
 * with a shared session cookie, even an expired one, goes on to the app so Web
 * can refresh it. Every other mounted page still asks for a sign-in.
 */
export function signedOutMountRootRedirect(
  request: NextRequest
): NextResponse | null {
  if (request.method !== 'GET' && request.method !== 'HEAD') return null;
  const destination = ROOT_DESTINATIONS.get(request.nextUrl.pathname);
  if (!destination || hasSupportedSupabaseAuthCookie(request)) return null;
  const target = new URL(destination, SHARED_APP_ORIGIN);
  target.search = request.nextUrl.search;
  return NextResponse.redirect(target, {
    headers: { 'cache-control': 'private, no-store' },
    status: 307,
  });
}
