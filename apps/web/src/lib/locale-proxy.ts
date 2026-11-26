import { match } from '@formatjs/intl-localematcher';
import Negotiator from 'negotiator';
import type { NextRequest, NextResponse } from 'next/server';
import createIntlMiddleware from 'next-intl/middleware';
import { LOCALE_COOKIE_NAME } from '@/constants/common';
import { defaultLocale, type Locale, supportedLocales } from '@/i18n/routing';
import { isPublicSeoPathname } from './seo/public-routes';

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

  const languages = new Negotiator({ headers })
    .languages()
    .flatMap((language) => {
      if (!language || language === '*') {
        return [];
      }

      try {
        const [canonicalLocale] = Intl.getCanonicalLocales(language);
        return canonicalLocale ? [canonicalLocale] : [];
      } catch {
        return [];
      }
    });

  let detectedLocale: string;

  try {
    detectedLocale = match(
      languages.length > 0 ? languages : [defaultLocale],
      supportedLocales,
      defaultLocale
    );
  } catch {
    detectedLocale = defaultLocale;
  }

  return {
    locale: supportedLocales.includes(detectedLocale as Locale)
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

const prefixedLocaleMiddleware = createIntlMiddleware({
  locales: supportedLocales,
  defaultLocale,
  localeDetection: false,
  localePrefix: 'always',
  localeCookie: false,
  alternateLinks: false,
});

/**
 * Forwards an already locale-prefixed request (such as `/vi/login` or
 * `/en/login`) through `next-intl` so `x-next-intl-locale` reaches SSR without
 * redirecting away from the prefix or emitting a `Set-Cookie` header that
 * would defeat CDN caching.
 */
export const handlePrefixedLocale = ({
  req,
}: {
  req: NextRequest;
}): NextResponse => prefixedLocaleMiddleware(req);

/**
 * Resolves locale headers for cacheable auth shells (`/login`, `/add-account`):
 * locale-prefixed paths keep their explicit prefix without redirects or cookies,
 * while unprefixed paths negotiate locale via `handleLocale`.
 */
export const handleAuthShellLocale = ({
  req,
}: {
  req: NextRequest;
}): NextResponse => {
  const firstSegment = req.nextUrl.pathname.split('/')[1] || '';
  return getSupportedLocale(firstSegment)
    ? handlePrefixedLocale({ req })
    : handleLocale({ localeCookie: false, req });
};

export const handleLocale = ({
  localeCookie,
  req,
}: {
  localeCookie?: false;
  req: NextRequest;
}): NextResponse => {
  // Get locale from cookie or browser languages
  const { locale } = getLocale(req);

  const pathname =
    req.nextUrl.pathname.replace(/^\/(?:en|vi)(?=\/|$)/u, '') || '/';
  const isMarketingPage = isPublicSeoPathname(pathname);
  const nextIntlMiddleware = createIntlMiddleware({
    locales: supportedLocales,
    // Sitemap and canonical URLs use English as the fixed unprefixed locale.
    // A Vietnamese URL must never redirect to an unprefixed English URL.
    defaultLocale: isMarketingPage ? defaultLocale : (locale as Locale),
    localeDetection: false,
    localePrefix: 'as-needed',
    ...(localeCookie === false ? { localeCookie: false } : {}),
  });

  return nextIntlMiddleware(req);
};
