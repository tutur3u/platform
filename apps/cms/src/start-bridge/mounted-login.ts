import { normalizeAuthRedirectPath } from '@tuturuuu/auth/proxy';
import { withAppBase } from '@tuturuuu/start-bridge/app-url';
import { type NextRequest, NextResponse } from 'next/server';

export function mountedLogin(request: NextRequest) {
  const base = request.nextUrl.basePath;
  if (!base || !/^\/(?:en\/|vi\/)?login\/?$/u.test(request.nextUrl.pathname))
    return null;
  const next = normalizeAuthRedirectPath(
    request.nextUrl.searchParams.get('next'),
    request.nextUrl.origin,
    '/'
  );
  const login = new URL('/login', 'https://tuturuuu.com');
  login.searchParams.set(
    'returnUrl',
    new URL(withAppBase(next, base), request.nextUrl.origin).toString()
  );
  const response = NextResponse.redirect(login);
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
