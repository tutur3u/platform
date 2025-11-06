import { LOCALE_COOKIE_NAME, PUBLIC_PATHS } from './constants/common';
import { Locale, defaultLocale, supportedLocales } from './i18n/routing';
import { match } from '@formatjs/intl-localematcher';
import { updateSession } from '@ncthub/supabase/next/proxy';
import { SupabaseUser } from '@ncthub/supabase/next/user';
import Negotiator from 'negotiator';
import createIntlMiddleware from 'next-intl/middleware';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

// In-memory rate limiting store
const ratelimit = new Map<
  string,
  { count: number; resetTime: number; emailCount: Map<string, number> }
>();

// Email-based rate limiting for OTP endpoint
const emailRateLimit = new Map<string, { count: number; resetTime: number }>();

// Cleanup old entries every 5 minutes
setInterval(
  () => {
    const now = Date.now();
    for (const [key, value] of ratelimit.entries()) {
      if (now > value.resetTime) {
        ratelimit.delete(key);
      }
    }
    for (const [key, value] of emailRateLimit.entries()) {
      if (now > value.resetTime) {
        emailRateLimit.delete(key);
      }
    }
  },
  5 * 60 * 1000
);

export async function proxy(req: NextRequest): Promise<NextResponse> {
  // Apply rate limiting to all API routes
  if (req.nextUrl.pathname.startsWith('/api')) {
    const rateLimitResponse = await handleRateLimit(req);
    if (rateLimitResponse) return rateLimitResponse;
  }

  // Make sure user session is always refreshed
  const { res, user } = await updateSession(req);

  // If current path starts with /api, return without redirecting
  if (req.nextUrl.pathname.startsWith('/api')) return res;

  // Handle special cases for public paths
  const { res: nextRes, redirect } = handleRedirect({ req, res, user });
  if (redirect) return nextRes;

  return handleLocale({ req });
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
     * - glb
     */

    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|site.webmanifest|monitoring|.*\\.(?:svg|png|jpg|jpeg|pdf|gif|webp|glb)$).*)',
  ],
};

const handleRateLimit = async (
  req: NextRequest
): Promise<NextResponse | null> => {
  const ip =
    req.headers.get('x-forwarded-for') ??
    req.headers.get('x-real-ip') ??
    'unknown';
  const now = Date.now();
  const windowMs = 60000; // 1 minute window

  // Different rate limits for different endpoints
  let maxRequestsPerIP: number;
  const pathname = req.nextUrl.pathname;

  // Stricter limits for sensitive endpoints
  if (pathname.includes('/auth/otp') || pathname.includes('/auth/signup')) {
    maxRequestsPerIP = 5; // 5 requests per minute for auth endpoints
  } else if (pathname.startsWith('/api/v1/workspaces')) {
    maxRequestsPerIP = 30; // 30 requests per minute for workspace operations
  } else if (pathname.startsWith('/api/proxy')) {
    maxRequestsPerIP = 20; // 20 requests per minute for proxy
  } else {
    maxRequestsPerIP = 60; // 60 requests per minute for general API endpoints
  }

  // Get or create rate limit record for this IP
  let record = ratelimit.get(ip);

  if (!record || now > record.resetTime) {
    // Create new record or reset expired one
    ratelimit.set(ip, {
      count: 1,
      resetTime: now + windowMs,
      emailCount: new Map(),
    });
  } else {
    // Check IP-based rate limit
    if (record.count >= maxRequestsPerIP) {
      const resetIn = Math.ceil((record.resetTime - now) / 1000);
      return NextResponse.json(
        {
          error: 'Too many requests from this IP. Please try again later.',
          resetIn,
          endpoint: pathname,
        },
        {
          status: 429,
          headers: {
            'X-RateLimit-Limit': maxRequestsPerIP.toString(),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': new Date(record.resetTime).toISOString(),
            'Retry-After': resetIn.toString(),
          },
        }
      );
    }

    // Increment IP counter
    record.count++;
  }

  // Additional email-based rate limiting for OTP endpoint
  if (pathname === '/api/auth/otp/send' && req.method === 'POST') {
    try {
      const body = await req.clone().json();
      const email = body.email;

      if (email) {
        const maxEmailRequests = 3;
        const emailLimit = emailRateLimit.get(email);

        if (!emailLimit || now > emailLimit.resetTime) {
          emailRateLimit.set(email, {
            count: 1,
            resetTime: now + windowMs,
          });
        } else if (emailLimit.count >= maxEmailRequests) {
          const resetIn = Math.ceil((emailLimit.resetTime - now) / 1000);
          return NextResponse.json(
            {
              error:
                'Too many OTP requests for this email. Please try again later.',
              resetIn,
            },
            {
              status: 429,
              headers: {
                'X-RateLimit-Limit': maxEmailRequests.toString(),
                'X-RateLimit-Remaining': '0',
                'X-RateLimit-Reset': new Date(
                  emailLimit.resetTime
                ).toISOString(),
                'Retry-After': resetIn.toString(),
              },
            }
          );
        } else {
          emailLimit.count++;
        }
      }
    } catch (error) {
      // If we can't parse the body, just continue with IP-based rate limiting
      console.error(
        'Error parsing request body for email rate limiting:',
        error
      );
    }
  }

  return null;
};
const handleRedirect = ({
  req,
  res,
  user,
}: {
  req: NextRequest;
  res: NextResponse;
  user: SupabaseUser | null;
}): {
  res: NextResponse;
  redirect: boolean;
} => {
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

const handleLocale = ({ req }: { req: NextRequest }): NextResponse => {
  // Get locale from cookie or browser languages
  const { locale } = getLocale(req);

  const nextIntlMiddleware = createIntlMiddleware({
    locales: supportedLocales,
    defaultLocale: locale as Locale,
    localeDetection: false,
    localePrefix: 'as-needed',
  });

  return nextIntlMiddleware(req);
};
