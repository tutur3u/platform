import {
  clearSupabaseAuthCookies,
  getAppSessionClaimsFromRequest,
} from '@tuturuuu/auth/app-session';
import {
  createCentralizedAuthProxy,
  getRequestHeadersWithResponseCookies,
  propagateAuthCookies,
} from '@tuturuuu/auth/proxy';
import { TTR_URL } from '@tuturuuu/meet-core/constants/common';
import { hasParleyAccess } from '@tuturuuu/meet-core/parley-access';
import { guardApiProxyRequest } from '@tuturuuu/utils/api-proxy-guard';
import { type NextRequest, NextResponse } from 'next/server';
import createIntlMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

const auth = createCentralizedAuthProxy({
  appSession: { sessionMode: 'app-session', targetApp: 'parley' },
  webAppUrl: TTR_URL,
  publicPaths: [
    '/login',
    '/verify-token',
    '/access-denied',
    '/en/login',
    '/vi/login',
    '/en/verify-token',
    '/vi/verify-token',
    '/en/access-denied',
    '/vi/access-denied',
  ],
  skipApiRoutes: true,
  excludeRootPath: false,
  mfa: { enabled: false },
});
const intl = createIntlMiddleware(routing);
export default async function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith('/api/')) {
    const denied = await guardApiProxyRequest(request, {
      prefixBase: 'proxy:parley:api',
    });
    if (denied) return denied;
  }
  const path =
    request.nextUrl.pathname.replace(/^\/(en|vi)(?=\/|$)/u, '') || '/';
  if (
    [
      '/api/auth/verify-app-token',
      '/api/auth/refresh-app-session',
      '/api/auth/logout',
      '/api/build-info',
    ].includes(path)
  )
    return NextResponse.next();
  if (['/login', '/verify-token', '/access-denied'].includes(path))
    return intl(request);
  const response = await auth(request);
  if (response.headers.get('location')) return response;
  const claims = getAppSessionClaimsFromRequest(
    { headers: getRequestHeadersWithResponseCookies(request, response) },
    {
      targetApp: 'parley',
    }
  );
  if (!claims)
    return path.startsWith('/api/')
      ? NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      : NextResponse.redirect(new URL('/login', request.url));
  try {
    if (!(await hasParleyAccess(claims.sub)))
      return path.startsWith('/api/')
        ? NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        : NextResponse.redirect(new URL('/access-denied', request.url));
  } catch {
    return NextResponse.json(
      { error: 'Access verification unavailable' },
      { status: 503 }
    );
  }
  const result = path.startsWith('/api/') ? NextResponse.next() : intl(request);
  clearSupabaseAuthCookies(request, result);
  propagateAuthCookies(response, result);
  return result;
}
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|meet-live-processor.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
