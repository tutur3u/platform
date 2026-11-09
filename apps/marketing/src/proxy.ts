import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import createIntlMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

const intlMiddleware = createIntlMiddleware(routing);

/**
 * Anonymous marketing pages only: locale negotiation, no session reads, no
 * auth cookies. Everything under `/api` belongs to the web app.
 */
export async function proxy(request: NextRequest): Promise<NextResponse> {
  if (request.nextUrl.pathname.startsWith('/api')) return NextResponse.next();
  return intlMiddleware(request) as NextResponse;
}

export const config = {
  matcher: ['/((?!_next|.*\\..*).*)'],
};
