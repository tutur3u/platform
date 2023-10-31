import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { match } from '@formatjs/intl-localematcher';
import Negotiator from 'negotiator';
import type { Session } from '@supabase/auth-helpers-nextjs';
import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs';
import i18n from '../i18n.json';
import { LOCALE_COOKIE_NAME } from './constants/common';
import type { Database } from '@/types/supabase';

export async function middleware(req: NextRequest): Promise<NextResponse> {
  const { res, session } = await handleSupabaseAuth({ req });

  // If current path ends with /login and user is logged in, redirect to home page
  if (req.nextUrl.pathname.endsWith('/login') && session)
    return NextResponse.redirect(
      req.nextUrl.href.replace('/login', '/onboarding')
    );

  return handleLocale({ req, res });
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

const handleSupabaseAuth = async ({
  req,
}: {
  req: NextRequest;
}): Promise<{
  res: NextResponse;
  session: Session | null;
}> => {
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

const getSupportedLocale = (locale: string): string | null => {
  const configs = i18n as {
    locales: string[];
  };

  return configs.locales.includes(locale) ? locale : null;
};

const getExistingLocale = (
  req: NextRequest
): {
  locale: string | null;
  cookie: string | null;
  pathname: string | null;
} => {
  // Get raw locale from pathname and cookie
  const rawLocaleFromPathname = req.nextUrl.pathname.split('/')[1] || '';
  const rawRocaleFromCookie = req.cookies.get(LOCALE_COOKIE_NAME)?.value || '';

  // Get supported locale from pathname and cookie
  const localeFromPathname = getSupportedLocale(rawLocaleFromPathname);
  const localeFromCookie = getSupportedLocale(rawRocaleFromCookie);

  return {
    locale: localeFromPathname || localeFromCookie,
    cookie: localeFromCookie,
    pathname: localeFromPathname,
  };
};

const getDefaultLocale = (
  req: NextRequest
): {
  locale: string;
} => {
  // Get browser languages
  const headers = {
    'accept-language': req.headers.get('accept-language') ?? 'en-US,en;q=0.5',
  };

  const configs = i18n as {
    locales: string[];
    defaultLocale: string;
  };

  const languages = new Negotiator({ headers }).languages();
  return { locale: match(languages, configs.locales, configs.defaultLocale) };
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

  // Update locale in search params to load correct translations
  req.nextUrl.searchParams.set('lang', locale);

  // Construct nextUrl with locale and redirect
  req.nextUrl.pathname = !pathname
    ? `/${locale}${req.nextUrl.pathname}`
    : req.nextUrl.pathname.replace(pathname, locale);

  return NextResponse.rewrite(req.nextUrl, res);
};
