import { NextRequest, NextResponse } from 'next/server';
import { match } from '@formatjs/intl-localematcher';
import Negotiator from 'negotiator';
import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs';
import { Database } from '@/types/supabase';
import i18n from '../i18n.json';
import { LOCALE_COOKIE_NAME } from './constants/common';

export async function middleware(req: NextRequest) {
  const { res, session } = await handleSupabaseAuth({ req });

  // If current path ends with /login and user is logged in, redirect to home page
  if (req.nextUrl.pathname.endsWith('/login') && session)
    return NextResponse.redirect(
      req.nextUrl.href.replace('/login', '/onboarding')
    );

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
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return { res, session };
};

const getSupportedLocale = (locale: string) => {
  return i18n.locales.includes(locale) ? locale : null;
};

const getExistingLocale = (req: NextRequest) => {
  // Get raw locale from pathname and cookie
  const rawLocaleFromPathname = req.nextUrl.pathname.split('/')?.[1] || '';
  const rawRocaleFromCookie = req.cookies.get(LOCALE_COOKIE_NAME)?.value || '';

  // Get supported locale from pathname and cookie
  const localeFromPathname = getSupportedLocale(rawLocaleFromPathname);
  const localeFromCookie = getSupportedLocale(rawRocaleFromCookie);

  return {
    data: localeFromPathname || localeFromCookie,
    cookie: localeFromCookie,
    pathname: localeFromPathname,
  };
};

const getDefaultLocale = (req: NextRequest) => {
  // Get browser languages
  let headers = {
    'accept-language': req.headers.get('accept-language') ?? 'en-US,en;q=0.5',
  };

  const languages = new Negotiator({ headers }).languages();
  return { data: match(languages, i18n.locales, i18n.defaultLocale) };
};

const getLocale = async (req: NextRequest) => {
  // Get locale from pathname and cookie
  const { data: existingLocale, cookie, pathname } = getExistingLocale(req);

  // If locale is found, return it
  if (existingLocale) {
    return {
      data: existingLocale,
      cookie,
      pathname,
      default: false,
    };
  }

  // If locale is not found, return default locale
  const { data: defaultLocale } = getDefaultLocale(req);

  return {
    data: defaultLocale,
    cookie,
    pathname,
    default: true,
  };
};

const handleLocale = async ({
  req,
  res,
}: {
  req: NextRequest;
  res: NextResponse;
}) => {
  // Get locale from cookie or browser languages
  const { data: locale, pathname } = await getLocale(req);

  // Update locale in search params to load correct translations
  req.nextUrl.searchParams.set('lang', locale);

  // Construct nextUrl with locale and redirect
  req.nextUrl.pathname = !pathname
    ? `/${locale}${req.nextUrl.pathname}`
    : req.nextUrl.pathname.replace(pathname, locale);

  return NextResponse.rewrite(req.nextUrl, res);
};
