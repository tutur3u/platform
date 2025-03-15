import { LOCALE_COOKIE_NAME, PUBLIC_PATHS } from './constants/common';
import { type Locale, defaultLocale, supportedLocales } from './i18n/routing';
import { match } from '@formatjs/intl-localematcher';
import { createCentralizedAuthMiddleware } from '@tuturuuu/auth/middleware';
import { INTERNAL_DOMAINS } from '@tuturuuu/utils/internal-domains';
import Negotiator from 'negotiator';
import createIntlMiddleware from 'next-intl/middleware';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

const WEB_APP_URL =
  process.env.NODE_ENV === 'production'
    ? 'https://tuturuuu.com'
    : 'http://localhost:7803';

const authMiddleware = createCentralizedAuthMiddleware({
  webAppUrl: WEB_APP_URL,
  publicPaths: PUBLIC_PATHS,
  skipApiRoutes: true,
  allowedOrigins: INTERNAL_DOMAINS,
});

export async function middleware(req: NextRequest): Promise<NextResponse> {
  // First handle authentication with the centralized middleware
  const authRes = await authMiddleware(req);

  // If the auth middleware returned a redirect response, return it
  if (authRes.headers.has('Location')) {
    return authRes;
  }

  // Skip locale handling for API routes
  if (req.nextUrl.pathname.startsWith('/api')) {
    return authRes;
  }

  // Continue with locale handling
  return handleLocale({ req, res: authRes });
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
     * - pdf
     * - gif
     * - webp
     */

    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|site.webmanifest|monitoring|.*\\.(?:svg|png|jpg|jpeg|pdf|gif|webp)$).*)',
  ],
};

const getSupportedLocale = (locale: string): Locale | null => {
  return supportedLocales.includes(locale as Locale)
    ? (locale as Locale)
    : null;
};

const getExistingLocale = (
  req: NextRequest
): {
  locale: Locale | null;
  cookie: string | null;
  pathname: string | null;
} => {
  // Get raw locale from pathname and cookie
  const rawLocaleFromPathname = req.nextUrl.pathname.split('/')[1] || '';
  const rawRocaleFromCookie = req.cookies.get(LOCALE_COOKIE_NAME)?.value || '';

  // Get supported locale from pathname and cookie
  const localeFromPathname = getSupportedLocale(rawLocaleFromPathname);
  const localeFromCookie = getSupportedLocale(rawRocaleFromCookie);

  const locale = localeFromPathname || localeFromCookie;

  return {
    locale,
    cookie: localeFromCookie,
    pathname: localeFromPathname,
  };
};

const getDefaultLocale = (
  req: NextRequest
): {
  locale: Locale;
} => {
  // Get browser languages
  const headers = {
    'accept-language': req.headers.get('accept-language') ?? 'en-US,en;q=0.5',
  };

  const languages = new Negotiator({ headers }).languages();
  const detectedLocale = match(languages, supportedLocales, defaultLocale);

  return {
    locale: supportedLocales.includes(detectedLocale as any)
      ? (detectedLocale as Locale)
      : defaultLocale,
  };
};

const getLocale = (
  req: NextRequest
): {
  locale: string;
  cookie: string | null;
  pathname: string | null;
  default: boolean;
} => {
  // Get locale from pathname and cookie
  const { locale: existingLocale, cookie, pathname } = getExistingLocale(req);

  // If locale is found, return it
  if (existingLocale) {
    return {
      locale: existingLocale,
      cookie,
      pathname,
      default: false,
    };
  }

  // If locale is not found, return default locale
  const { locale: defaultLocale } = getDefaultLocale(req);

  return {
    locale: defaultLocale,
    cookie,
    pathname,
    default: true,
  };
};

const handleLocale = ({
  req,
  res,
}: {
  req: NextRequest;
  res: NextResponse;
}): NextResponse => {
  // Get locale from cookie or browser languages
  const { locale, pathname } = getLocale(req);

  // Construct nextUrl with locale and redirect
  req.nextUrl.pathname = !pathname
    ? `/${locale}${req.nextUrl.pathname}`
    : req.nextUrl.pathname.replace(pathname, locale);

  NextResponse.rewrite(req.nextUrl, res);

  const nextIntlMiddleware = createIntlMiddleware({
    locales: supportedLocales,
    defaultLocale: locale as Locale,
    localeDetection: false,
  });

  return nextIntlMiddleware(req);
};
