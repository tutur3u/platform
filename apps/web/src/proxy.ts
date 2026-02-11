import { match } from '@formatjs/intl-localematcher';
import { createCentralizedAuthProxy } from '@tuturuuu/auth/proxy';
import { createClient } from '@tuturuuu/supabase/next/server';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { getUserDefaultWorkspace } from '@tuturuuu/utils/user-helper';
import { isPersonalWorkspace } from '@tuturuuu/utils/workspace-helper';
import Negotiator from 'negotiator';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import createIntlMiddleware from 'next-intl/middleware';
import { LOCALE_COOKIE_NAME, PORT, PUBLIC_PATHS } from './constants/common';
import { defaultLocale, type Locale, supportedLocales } from './i18n/routing';

// Paths that should bypass onboarding check (public/marketing pages + auth flows)
const ONBOARDING_BYPASS_PATHS = [
  // Auth flows
  '/onboarding',
  '/login',
  '/signup',
  '/auth',
  '/api',
  '/logout',
  '/verify',
  '/reset-password',
  '/mfa',
  // Public/marketing pages (should match APP_PUBLIC_PATHS in public_paths.ts)
  '/invite',
  '/home',
  '/pricing',
  '/about',
  '/contact',
  '/features',
  '/products',
  '/solutions',
  '/careers',
  '/partners',
  '/security',
  '/contributors',
  '/blog',
  '/faq',
  '/terms',
  '/privacy',
  '/branding',
  '/changelog',
  '/ai/chats',
  '/qr-generator',
  '/documents',
  '/meet',
  '/meet-together',
  '/women-in-tech',
  '/vietnamese-womens-day',
  '/visualizations',
];

const WEB_APP_URL =
  process.env.NODE_ENV === 'production'
    ? 'https://tuturuuu.com'
    : `http://localhost:${PORT}`;

/**
 * Check if a user's personal workspace is missing an active subscription.
 * Returns true if the personal workspace exists but has no active subscription.
 * Fail-open: returns false on any error to avoid blocking users.
 */
async function personalWorkspaceMissingSubscription(
  userId: string
): Promise<boolean> {
  try {
    const supabase = await createClient();

    // Find user's personal workspace
    const { data: workspace, error: wsError } = await supabase
      .from('workspaces')
      .select('id')
      .eq('creator_id', userId)
      .eq('personal', true)
      .maybeSingle();

    if (wsError || !workspace) {
      return false;
    }

    // Check for an active subscription on that workspace
    const { count, error: subError } = await supabase
      .from('workspace_subscriptions')
      .select('*', { count: 'exact', head: true })
      .eq('ws_id', workspace.id)
      .eq('status', 'active');

    if (subError) {
      return false;
    }

    return (count ?? 0) === 0;
  } catch {
    return false;
  }
}

/**
 * Check if user needs to complete onboarding
 * Returns true if user should be redirected to onboarding
 */
async function shouldRedirectToOnboarding(userId: string): Promise<boolean> {
  try {
    const supabase = await createClient();

    // Check onboarding progress
    const { data: progress } = await supabase
      .from('onboarding_progress')
      .select('completed_at, profile_completed')
      .eq('user_id', userId)
      .maybeSingle();

    // If onboarding is completed, no redirect needed
    if (progress?.completed_at) {
      return false;
    }

    // If no progress record exists, user needs onboarding
    if (!progress) {
      return true;
    }

    // If profile is not completed (display name not set), redirect to onboarding
    if (!progress.profile_completed) {
      return true;
    }

    // Otherwise, onboarding is in progress but not complete
    return true;
  } catch (error) {
    console.error('Error checking onboarding status:', error);
    // On error, don't block access - let them through
    return false;
  }
}

/**
 * Check if user has completed onboarding
 * Returns true if onboarding is fully complete
 */
async function hasCompletedOnboarding(userId: string): Promise<boolean> {
  try {
    const supabase = await createClient();

    const { data: progress } = await supabase
      .from('onboarding_progress')
      .select('completed_at')
      .eq('user_id', userId)
      .maybeSingle();

    return !!progress?.completed_at;
  } catch (error) {
    console.error('Error checking onboarding completion:', error);
    return false;
  }
}

/**
 * Check if the path is the onboarding page
 */
function isOnboardingPath(pathname: string): boolean {
  const segments = pathname.split('/').filter(Boolean);
  const firstSegment = segments[0] || '';
  const isLocale = supportedLocales.includes(firstSegment as Locale);

  const pathWithoutLocale = isLocale
    ? `/${segments.slice(1).join('/')}`
    : pathname;

  return (
    pathWithoutLocale === '/onboarding' ||
    pathWithoutLocale.startsWith('/onboarding/')
  );
}

/**
 * Check if the current path should bypass onboarding check
 */
function shouldBypassOnboardingCheck(pathname: string): boolean {
  // Get path segments
  const segments = pathname.split('/').filter(Boolean);

  // Check if first segment is a locale
  const firstSegment = segments[0] || '';
  const isLocale = supportedLocales.includes(firstSegment as Locale);

  // Get the path without locale prefix
  const pathWithoutLocale = isLocale
    ? `/${segments.slice(1).join('/')}`
    : pathname;

  // Check against bypass paths
  return ONBOARDING_BYPASS_PATHS.some(
    (bypassPath) =>
      pathWithoutLocale.startsWith(bypassPath) ||
      pathWithoutLocale === bypassPath
  );
}

const authProxy = createCentralizedAuthProxy({
  webAppUrl: WEB_APP_URL,
  publicPaths: PUBLIC_PATHS,
  skipApiRoutes: true,
});

export async function proxy(req: NextRequest): Promise<NextResponse> {
  // Handle authentication and MFA with the centralized middleware
  const authRes = await authProxy(req);

  // If the auth middleware returned a redirect response, return it
  if (authRes.headers.has('Location')) {
    return authRes;
  }

  // Skip locale handling for API routes
  if (req.nextUrl.pathname.startsWith('/api')) {
    return authRes;
  }

  // Check if user is on the onboarding page but has already completed onboarding
  // If so, redirect them to their default workspace
  if (isOnboardingPath(req.nextUrl.pathname)) {
    try {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const completed = await hasCompletedOnboarding(user.id);
        if (completed) {
          // Get user's default workspace
          const defaultWorkspace = await getUserDefaultWorkspace();
          if (defaultWorkspace) {
            const target = defaultWorkspace.personal
              ? 'personal'
              : defaultWorkspace.id === ROOT_WORKSPACE_ID
                ? 'internal'
                : defaultWorkspace.id;
            const redirectUrl = new URL(`/${target}`, req.nextUrl);
            return NextResponse.redirect(redirectUrl);
          }
          // Fallback to personal if no default workspace
          const redirectUrl = new URL('/personal', req.nextUrl);
          return NextResponse.redirect(redirectUrl);
        }
      }
    } catch (error) {
      console.error(
        'Error checking onboarding completion in middleware:',
        error
      );
      // Continue with normal flow if there's an error
    }
  }

  // Check if authenticated user needs onboarding
  // This runs early to ensure users complete onboarding before accessing the platform
  if (!shouldBypassOnboardingCheck(req.nextUrl.pathname)) {
    try {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const needsOnboarding = await shouldRedirectToOnboarding(user.id);
        if (needsOnboarding) {
          const redirectUrl = new URL('/onboarding', req.nextUrl);

          // Preserve returnUrl if coming from external app login flow
          // This ensures users are redirected back to the external app after onboarding
          const returnUrl = req.nextUrl.searchParams.get('returnUrl');
          if (returnUrl) {
            redirectUrl.searchParams.set('returnUrl', returnUrl);
          }

          // Also preserve nextUrl for internal redirects
          const nextUrl = req.nextUrl.searchParams.get('nextUrl');
          if (nextUrl) {
            redirectUrl.searchParams.set('nextUrl', nextUrl);
          } else {
            // If no nextUrl param, use the current path + search params as nextUrl
            // This ensures users who land on a deep link (e.g. /finance/invoices)
            // get redirected back there after onboarding
            const currentPath = req.nextUrl.pathname + req.nextUrl.search;
            // Only set if we're not already on a root/home path to avoid infinite loops or redundancy
            if (currentPath !== '/' && currentPath !== '/login') {
              redirectUrl.searchParams.set('nextUrl', currentPath);
            }
          }

          return NextResponse.redirect(redirectUrl);
        }

        // User completed onboarding — check if their personal workspace
        // is missing a free subscription. If so, redirect to /onboarding
        // where it will be created server-side before bouncing back.
        const alreadyAttempted =
          req.cookies.get('subscription_fix_attempted')?.value === '1';

        if (!alreadyAttempted) {
          const isMissing = await personalWorkspaceMissingSubscription(user.id);

          if (isMissing) {
            const fixUrl = new URL('/onboarding', req.nextUrl);
            const response = NextResponse.redirect(fixUrl);
            response.cookies.set('subscription_fix_attempted', '1', {
              httpOnly: true,
              secure: process.env.NODE_ENV === 'production',
              sameSite: 'lax',
              maxAge: 60 * 60 * 24, // 24 hours
              path: '/',
            });
            return response;
          }
        }
      }
    } catch (error) {
      console.error('Error checking onboarding in middleware:', error);
      // Continue with normal flow if there's an error
    }
  }

  // Handle /home path - redirect to root without workspace redirect
  const pathSegments = req.nextUrl.pathname.split('/').filter(Boolean);
  const isHomePath =
    req.nextUrl.pathname === '/home' ||
    (pathSegments.length === 2 &&
      supportedLocales.includes(pathSegments[0] as Locale) &&
      pathSegments[1] === 'home');

  if (isHomePath) {
    const redirectUrl = new URL('/', req.nextUrl);
    redirectUrl.searchParams.set('no-redirect', '1');
    return NextResponse.redirect(redirectUrl);
  }

  // Handle direct navigation to workspace IDs that are personal workspaces
  // Check if the path matches /[locale]/[wsId] or /[wsId] pattern where wsId is a UUID
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  let potentialWorkspaceId: string | null = null;
  let hasLocaleInPath = false;

  const isRootWorkspaceSegment = (segment?: string) =>
    segment?.toLowerCase() === ROOT_WORKSPACE_ID.toLowerCase();

  if (pathSegments.length >= 1) {
    // Check if first segment is a locale
    if (
      pathSegments[0] &&
      supportedLocales.includes(pathSegments[0] as Locale)
    ) {
      hasLocaleInPath = true;
      // Check if second segment is a workspace ID
      if (pathSegments.length >= 2 && pathSegments[1]) {
        const candidate = pathSegments[1];
        if (isRootWorkspaceSegment(candidate)) {
          potentialWorkspaceId = ROOT_WORKSPACE_ID;
        } else if (uuidRegex.test(candidate)) {
          potentialWorkspaceId = candidate;
        }
      }
    } else if (pathSegments[0]) {
      // First segment is a workspace ID (no locale in path)
      if (isRootWorkspaceSegment(pathSegments[0])) {
        potentialWorkspaceId = ROOT_WORKSPACE_ID;
      } else if (uuidRegex.test(pathSegments[0])) {
        potentialWorkspaceId = pathSegments[0];
      }
    }
  }

  // Remap root workspace URL to the internal workspace slug for consistency
  if (potentialWorkspaceId === ROOT_WORKSPACE_ID) {
    const wsIdIndex = hasLocaleInPath ? 1 : 0;
    const newPathSegments = [...pathSegments];

    if (newPathSegments[wsIdIndex] !== 'internal') {
      newPathSegments[wsIdIndex] = 'internal';
      const redirectUrl = new URL(`/${newPathSegments.join('/')}`, req.nextUrl);
      redirectUrl.search = req.nextUrl.search;

      return NextResponse.redirect(redirectUrl);
    }
  }

  // If we found a potential workspace ID, check if it's a personal workspace
  if (potentialWorkspaceId) {
    try {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const isPersonal = await isPersonalWorkspace(potentialWorkspaceId);

        if (isPersonal) {
          // Construct the redirect URL replacing the workspace ID with 'personal'
          const newPathSegments = [...pathSegments];
          const wsIdIndex = hasLocaleInPath ? 1 : 0;
          newPathSegments[wsIdIndex] = 'personal';

          const redirectUrl = new URL(
            `/${newPathSegments.join('/')}`,
            req.nextUrl
          );
          // Preserve query parameters
          redirectUrl.search = req.nextUrl.search;

          return NextResponse.redirect(redirectUrl);
        }
      }
    } catch (error) {
      console.error('Error checking personal workspace in middleware:', error);
      // Continue with normal flow if there's an error
    }
  }

  // Handle authenticated users accessing the root path or root with locale
  // Skip workspace redirect if no-redirect parameter is present (from /home redirect)
  const isRootPath = req.nextUrl.pathname === '/';

  const isLocaleRootPath =
    pathSegments.length === 1 &&
    supportedLocales.includes(pathSegments[0] as Locale);

  const skipWorkspaceRedirect = req.nextUrl.searchParams.has('no-redirect');
  const isHashNavigation = req.nextUrl.searchParams.has('hash-nav');
  const isMultiAccountFlow = req.nextUrl.searchParams.has('multiAccount');

  if (
    (isRootPath || isLocaleRootPath) &&
    !skipWorkspaceRedirect &&
    !isHashNavigation &&
    !isMultiAccountFlow
  ) {
    try {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const defaultWorkspace = await getUserDefaultWorkspace();

        if (defaultWorkspace) {
          const target = defaultWorkspace.personal
            ? 'personal'
            : defaultWorkspace.id === ROOT_WORKSPACE_ID
              ? 'internal'
              : defaultWorkspace.id;
          const redirectUrl = new URL(`/${target}`, req.nextUrl);
          return NextResponse.redirect(redirectUrl);
        }
      }
    } catch (error) {
      console.error('Error handling root path redirect:', error);
    }
  }

  // Continue with locale handling
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
     * - site.webmanifest (legacy PWA manifest)
     * - manifest.webmanifest (PWA manifest generated by Next.js)
     * - sw.js (service worker)
     * - monitoring (analytics)
     * - .well-known (domain verification files)
     * Excludes files with the following extensions for static assets:
     * - svg
     * - png
     * - jpg
     * - jpeg
     * - pdf
     * - gif
     * - webp
     */

    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|site.webmanifest|manifest.webmanifest|sw.js|monitoring|\\.well-known|.*\\.(?:svg|png|jpg|jpeg|pdf|gif|webp)$).*)',
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
