import { guardApiProxyRequest } from '@tuturuuu/utils/api-proxy-guard';
import { withSecureLocaleCookie } from '@tuturuuu/utils/locale-cookie';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import createIntlMiddleware from 'next-intl/middleware';
import { BASE_URL } from './constants/common';
import { routing } from './i18n/routing';

const intlMiddleware = createIntlMiddleware(routing);

/**
 * Anonymous marketing pages only: locale negotiation, no session reads, no
 * auth cookies. Everything under `/api` belongs to the web app; any `/api`
 * request that still reaches this app goes through the shared API guard
 * (payload limits, abuse and rate policies) like every other app.
 */
async function handleProxy(request: NextRequest): Promise<NextResponse> {
  // The roadmap routes (MARKETING_ROADMAP_ROUTES=1 at build time, see
  // scripts/roadmap-routes.mjs) keep their own /roadmap and /roadmap/vi URLs:
  // no locale negotiation, rewrite or cookie. Off, this folds away.
  if (
    process.env.MARKETING_ROADMAP_ROUTES === '1' &&
    /^\/roadmap(?:\/|$)/u.test(request.nextUrl.pathname)
  ) {
    return NextResponse.next();
  }
  if (request.nextUrl.pathname.startsWith('/api')) {
    const guardResponse = await guardApiProxyRequest(request, {
      prefixBase: 'proxy:marketing:api',
    });
    return guardResponse ?? NextResponse.next();
  }
  return intlMiddleware(request) as NextResponse;
}

export const proxy = withSecureLocaleCookie(handleProxy, () => BASE_URL);

export const config = {
  matcher: ['/((?!_next|.*\\..*).*)'],
};
