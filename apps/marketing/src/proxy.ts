import { guardApiProxyRequest } from '@tuturuuu/utils/api-proxy-guard';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import createIntlMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

const intlMiddleware = createIntlMiddleware(routing);

/**
 * Anonymous marketing pages only: locale negotiation, no session reads, no
 * auth cookies. Everything under `/api` belongs to the web app; any `/api`
 * request that still reaches this app goes through the shared API guard
 * (payload limits, abuse and rate policies) like every other app.
 */
export async function proxy(request: NextRequest): Promise<NextResponse> {
  if (request.nextUrl.pathname.startsWith('/api')) {
    const guardResponse = await guardApiProxyRequest(request, {
      prefixBase: 'proxy:marketing:api',
    });
    return guardResponse ?? NextResponse.next();
  }
  return intlMiddleware(request) as NextResponse;
}

export const config = {
  matcher: ['/((?!_next|.*\\..*).*)'],
};
