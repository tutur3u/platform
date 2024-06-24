import { defaultLocale, locales } from './config';
import { updateSession } from './utils/supabase/middleware';
import { User } from '@supabase/supabase-js';
import createIntlMiddleware from 'next-intl/middleware';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export async function middleware(req: NextRequest): Promise<NextResponse> {
  // Make sure user session is always refreshed
  const { res, user } = await updateSession(req);

  // If current path starts with /api, return without redirecting
  if (req.nextUrl.pathname.startsWith('/api')) return res;

  // Handle special cases for public paths
  const { res: nextRes, redirect } = handleRedirect({ req, res, user });
  if (redirect) return nextRes;

  return handleI18nRouting(req);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - robots.txt (SEO)
     * - sitemap.xml (SEO)
     * - site.webmanifest (SEO)
     * - monitoring (analytics)
     * Excludes files with the following extensions for static assets:
     * - svg
     * - png
     * - jpg
     * - jpeg
     * - gif
     * - webp
     */

    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|site.webmanifest|monitoring|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};

const handleI18nRouting = createIntlMiddleware({
  locales,
  defaultLocale,
});

const handleRedirect = ({
  req,
  res,
  user,
}: {
  req: NextRequest;
  res: NextResponse;
  user: User | null;
}): {
  res: NextResponse;
  redirect: boolean;
} => {
  // If current path starts with /api, return without redirecting
  if (req.nextUrl.pathname.startsWith('/api')) {
    return { res, redirect: false };
  }

  // If current path ends with /login and user is logged in, redirect to onboarding page
  if (req.nextUrl.pathname.endsWith('/login') && user) {
    const nextRes = NextResponse.redirect(
      req.nextUrl.href.replace('/login', '/onboarding')
    );

    return { res: nextRes, redirect: true };
  }

  // If current path ends with /onboarding and user is not logged in, redirect to login page
  if (
    req.nextUrl.pathname !== '/' &&
    !req.nextUrl.pathname.endsWith('/login') &&
    !PUBLIC_PATHS.some((path) => req.nextUrl.pathname.startsWith(path)) &&
    !user
  ) {
    const nextRes = NextResponse.redirect(
      req.nextUrl.href.replace(req.nextUrl.pathname, '/login') +
        `?nextUrl=${req.nextUrl.pathname}`
    );

    return { res: nextRes, redirect: true };
  }

  return { res, redirect: false };
};

const PUBLIC_PATHS = [
  '/terms',
  '/privacy',
  '/branding',
  '/ai/chats',
  '/calendar/meet-together',
];
