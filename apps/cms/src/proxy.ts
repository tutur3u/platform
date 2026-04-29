import { match } from '@formatjs/intl-localematcher';
import {
  createCentralizedAuthProxy,
  propagateAuthCookies,
} from '@tuturuuu/auth/proxy';
import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import { createClient } from '@tuturuuu/supabase/next/server';
import { guardApiProxyRequest } from '@tuturuuu/utils/api-proxy-guard';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { getUserDefaultWorkspace } from '@tuturuuu/utils/user-helper';
import {
  getPermissions,
  getWorkspaces,
  isPersonalWorkspace,
} from '@tuturuuu/utils/workspace-helper';
import Negotiator from 'negotiator';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import createIntlMiddleware from 'next-intl/middleware';
import {
  CENTRAL_PORT,
  LOCALE_COOKIE_NAME,
  PUBLIC_PATHS,
} from './constants/common';
import { defaultLocale, type Locale, supportedLocales } from './i18n/routing';
import {
  hasRootExternalProjectsAdminPermission,
  resolveWorkspaceExternalProjectBinding,
} from './lib/external-projects/access';

const WEB_APP_URL =
  process.env.NODE_ENV === 'production'
    ? 'https://tuturuuu.com'
    : `http://localhost:${CENTRAL_PORT}`;

type JoinedWorkspace = NonNullable<
  Awaited<ReturnType<typeof getWorkspaces>>
>[number];

// Create the centralized auth middleware
// MFA is disabled because satellite apps delegate auth to the web app.
// Sessions here are created via cross-app tokens that already require aal2 on web.
const authProxy = createCentralizedAuthProxy({
  webAppUrl: WEB_APP_URL,
  publicPaths: PUBLIC_PATHS,
  skipApiRoutes: true,
  excludeRootPath: true,
  isPublicPath: (pathname) => {
    const pathSegments = pathname.split('/').filter(Boolean);
    const firstSegment = pathSegments[0];
    const hasLocalePrefix =
      firstSegment && supportedLocales.includes(firstSegment as Locale);
    const unlocalizedPath = `/${pathSegments
      .slice(hasLocalePrefix ? 1 : 0)
      .join('/')}`;

    return unlocalizedPath.startsWith('/play/');
  },
  mfa: { enabled: false },
});

export async function proxy(req: NextRequest): Promise<NextResponse> {
  if (req.nextUrl.pathname.startsWith('/api')) {
    const guardResponse = await guardApiProxyRequest(req, {
      prefixBase: 'proxy:cms:api',
    });
    if (guardResponse) {
      return guardResponse;
    }

    return NextResponse.next();
  }

  // Handle authentication and MFA with the centralized middleware
  const authRes = await authProxy(req);

  // If the auth middleware returned a redirect response, return it
  if (authRes.headers.has('Location')) {
    return authRes;
  }

  // Handle direct navigation to workspace IDs that are personal workspaces
  // Check if the path matches /[locale]/[wsId] or /[wsId] pattern where wsId is a UUID
  const pathSegments = req.nextUrl.pathname.split('/').filter(Boolean);
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

      const rootRedirect = NextResponse.redirect(redirectUrl);
      propagateAuthCookies(authRes, rootRedirect);
      return rootRedirect;
    }
  }

  // If we found a potential workspace ID, check if it's a personal workspace
  if (potentialWorkspaceId) {
    try {
      const supabase = await createClient();
      const { user } = await resolveAuthenticatedSessionUser(supabase);

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

          const personalRedirect = NextResponse.redirect(redirectUrl);
          propagateAuthCookies(authRes, personalRedirect);
          return personalRedirect;
        }
      }
    } catch (error) {
      console.error('Error checking personal workspace in middleware:', error);
      // Continue with normal flow if there's an error
    }
  }

  // Handle authenticated users accessing the root path or root with locale
  // Redirect to their default accessible CMS workspace or the root admin surface.
  const isRootPath = req.nextUrl.pathname === '/';
  const isLocaleRootPath =
    pathSegments.length === 1 &&
    supportedLocales.includes(pathSegments[0] as Locale);
  const localePrefix =
    isLocaleRootPath && pathSegments[0] ? `/${pathSegments[0]}` : '';

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
      const { user } = await resolveAuthenticatedSessionUser(supabase);

      if (user) {
        const [defaultWorkspace, joinedWorkspaces, rootPermissions] =
          await Promise.all([
            getUserDefaultWorkspace(),
            getWorkspaces({ useAdmin: true }),
            getPermissions({ wsId: ROOT_WORKSPACE_ID }),
          ]);

        const isRootAdmin =
          hasRootExternalProjectsAdminPermission(rootPermissions);
        const accessibleWorkspaces = (
          await Promise.all(
            (joinedWorkspaces ?? []).map(async (workspace) => {
              if (workspace.id === ROOT_WORKSPACE_ID) {
                return isRootAdmin ? workspace : null;
              }

              const [binding, workspacePermissions] = await Promise.all([
                resolveWorkspaceExternalProjectBinding(workspace.id),
                getPermissions({ wsId: workspace.id }),
              ]);

              const canAccessWorkspace =
                binding.enabled &&
                Boolean(binding.canonical_project) &&
                (workspacePermissions?.containsPermission(
                  'manage_external_projects'
                ) ||
                  workspacePermissions?.containsPermission(
                    'publish_external_projects'
                  ) ||
                  isRootAdmin);

              return canAccessWorkspace ? workspace : null;
            })
          )
        ).filter(
          (workspace): workspace is JoinedWorkspace => workspace !== null
        );

        const preferredWorkspace =
          accessibleWorkspaces.find(
            (workspace) => workspace.id === defaultWorkspace?.id
          ) ??
          accessibleWorkspaces.find(
            (workspace) => workspace.id !== ROOT_WORKSPACE_ID
          ) ??
          accessibleWorkspaces[0] ??
          null;

        if (preferredWorkspace) {
          const target = preferredWorkspace.personal
            ? 'personal'
            : preferredWorkspace.id === ROOT_WORKSPACE_ID
              ? 'internal'
              : preferredWorkspace.id;
          const redirectUrl = new URL(`${localePrefix}/${target}`, req.nextUrl);
          const wsRedirect = NextResponse.redirect(redirectUrl);
          propagateAuthCookies(authRes, wsRedirect);
          return wsRedirect;
        }

        const fallbackUrl = new URL(
          `${localePrefix}${isRootAdmin ? '/internal/projects' : '/no-access'}`,
          req.nextUrl
        );
        const fallbackRedirect = NextResponse.redirect(fallbackUrl);
        propagateAuthCookies(authRes, fallbackRedirect);
        return fallbackRedirect;
      }
    } catch (error) {
      console.error('Error handling root path redirect:', error);
    }
  }

  // Continue with locale handling
  const localeRes = handleLocale({ req });
  propagateAuthCookies(authRes, localeRes);
  return localeRes;
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
