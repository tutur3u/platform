import { NextRequest, NextResponse } from 'next/server';
import { match } from '@formatjs/intl-localematcher';
import Negotiator from 'negotiator';
import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs';
import { Database } from '@/types/supabase';
import i18n from '../i18n.json';
import { LOCALE_COOKIE_NAME } from './constants/common';

export async function middleware(req: NextRequest) {
  const res = await handleSupabaseAuth({ req });
  return await handleLocale({ req, res });
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - media (media files)
     * - favicon.ico (favicon file)
     * - monitoring (analytics)
     */
    '/((?!api|_next/static|_next/image|favicon.ico|monitoring|media).*)',
  ],
};

const handleSupabaseAuth = async ({ req }: { req: NextRequest }) => {
  // Create a NextResponse object to handle the response
  const res = NextResponse.next();

  // Create a Supabase client configured to use cookies
  const supabase = createMiddlewareClient<Database>({ req, res });

  // Refresh session if expired - required for Server Components
  // https://supabase.com/docs/guides/auth/auth-helpers/nextjs#managing-session-with-middleware
  await supabase.auth.getSession();

  return res;
};

const getLocale = async (req: NextRequest) => {
  // Get locale from cookie
  const localeFromCookie = req.cookies.get(LOCALE_COOKIE_NAME)?.value;
  const localeFromSearch = req.nextUrl.search.split('lang=')?.[1];

  const locale = localeFromSearch || localeFromCookie;

  // Check if locale is supported
  if (locale && i18n.locales.includes(locale)) {
    return locale;
  }

  // Get browser languages
  let headers = {
    'accept-language': req.headers.get('accept-language') ?? 'en-US,en;q=0.5',
  };

  const languages = new Negotiator({ headers }).languages();

  // Match browser languages with supported locales
  return match(languages, i18n.locales, i18n.defaultLocale);
};

const hasLocaleFromPathname = (req: NextRequest) => {
  const localeFromPathname = req.nextUrl.pathname.split('/')?.[1];
  return i18n.locales.includes(localeFromPathname);
};

const hasLocaleFromSearch = (req: NextRequest) => {
  const localeFromSearch = req.nextUrl.search.split('lang=')?.[1];
  return i18n.locales.includes(localeFromSearch);
};

const handleLocale = async ({
  req,
  res,
}: {
  req: NextRequest;
  res: NextResponse;
}) => {
  const locale = await getLocale(req);

  // redirect to default locale if no locale is found
  if (!hasLocaleFromPathname(req)) {
    req.nextUrl.searchParams.set('lang', locale);
    req.nextUrl.pathname = `/${locale}${req.nextUrl.pathname}`;
    NextResponse.redirect(req.nextUrl);
  }

  if (hasLocaleFromSearch(req)) {
    req.nextUrl.searchParams.set('lang', locale);
    req.nextUrl.pathname = req.nextUrl.pathname.replace(
      `/${req.nextUrl.pathname.split('/')?.[1]}`,
      `/${locale}`
    );
  }

  return NextResponse.rewrite(req.nextUrl, res);
};
