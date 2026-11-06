import {
  hasSupportedSupabaseAuthCookie,
  hasWebAppSessionTokenFromRequest,
} from '@tuturuuu/auth/app-session';
import { guardApiProxyRequest } from '@tuturuuu/utils/api-proxy-guard';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { createPlaygroundLoginUrl } from '@/lib/login-url';

export async function proxy(req: NextRequest): Promise<NextResponse> {
  if (req.nextUrl.pathname.startsWith('/api')) {
    const guardResponse = await guardApiProxyRequest(req, {
      prefixBase: 'proxy:playground:api',
    });
    if (guardResponse) {
      return guardResponse;
    }

    return NextResponse.next();
  }

  // Pages are staff-only. This is the cheap signed-out redirect; the page
  // layout re-checks the verified staff session on the server.
  if (
    !hasWebAppSessionTokenFromRequest(req) &&
    !hasSupportedSupabaseAuthCookie(req)
  ) {
    return NextResponse.redirect(createPlaygroundLoginUrl(req.nextUrl.href));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next|.*\\..*).*)'],
};
