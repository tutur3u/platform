import { updateSession } from '@tuturuuu/supabase/next/middleware';
import { createClient } from '@tuturuuu/supabase/next/server';
import { SupabaseUser } from '@tuturuuu/supabase/next/user';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

/**
 * Handles MFA verification checks for authenticated users
 */
async function handleMFACheck(
  req: NextRequest,
  webAppUrl: string,
  protectedPaths: string[],
  excludedPaths: string[],
  enforceForAll: boolean
): Promise<NextResponse | null> {
  const pathname = req.nextUrl.pathname;

  // Skip if path is excluded
  if (excludedPaths.some((path) => pathname.startsWith(path))) {
    return null;
  }

  // Check if this path requires MFA
  const needsMFA =
    enforceForAll || protectedPaths.some((path) => pathname.startsWith(path));

  if (!needsMFA) {
    return null;
  }

  try {
    const supabase = await createClient();

    // Check current AAL level
    const { data: assuranceLevel } =
      await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

    if (
      assuranceLevel?.currentLevel === 'aal1' &&
      assuranceLevel?.nextLevel === 'aal2'
    ) {
      // Check if this is the central web app handling MFA
      const isCentralWebApp =
        req.nextUrl.port === '7803' ||
        req.nextUrl.hostname.includes('tuturuuu.com') ||
        req.nextUrl.origin === webAppUrl;

      if (isCentralWebApp) {
        // Handle MFA verification in the login page
        const returnUrl = encodeURIComponent(
          req.nextUrl.pathname + req.nextUrl.search
        );
        const loginUrl = new URL('/login', req.nextUrl);
        loginUrl.searchParams.set('nextUrl', returnUrl);
        loginUrl.searchParams.set('mfa', 'required');

        return NextResponse.redirect(loginUrl);
      } else {
        // All other apps redirect to central web app for MFA verification
        const returnUrl = encodeURIComponent(req.nextUrl.href);
        const loginUrl = new URL('/login', webAppUrl);
        loginUrl.searchParams.set('returnUrl', returnUrl);
        loginUrl.searchParams.set('mfa', 'required');

        return NextResponse.redirect(loginUrl);
      }
    }

    return null;
  } catch (error) {
    console.error('Error checking MFA:', error);
    return null;
  }
}

interface CentralizedAuthOptions {
  /**
   * The URL of the central authentication web app (without trailing slash)
   */
  webAppUrl: string;

  /**
   * Public paths that don't require authentication
   */
  publicPaths?: string[];

  /**
   * Whether to exclude the root path from authentication checks
   * @default false
   */
  excludeRootPath?: boolean;

  /**
   * Callback function to determine if a path should be public
   */
  // eslint-disable-next-line no-unused-vars
  isPublicPath?: (pathname: string) => boolean;

  /**
   * Whether to skip authentication checks for API routes
   * @default true
   */
  skipApiRoutes?: boolean;

  /**
   * MFA configuration options
   */
  mfa?: {
    /**
     * Whether to enable MFA enforcement
     * @default true
     */
    enabled?: boolean;

    /**
     * Paths that require MFA
     */
    protectedPaths?: string[];

    /**
     * Paths that are excluded from MFA checks
     */
    excludedPaths?: string[];

    /**
     * Whether to enforce MFA for all authenticated routes
     * @default true
     */
    enforceForAll?: boolean;
  };
}

interface MFAMiddlewareOptions {
  /**
   * Paths that require MFA
   */
  protectedPaths?: string[];

  /**
   * Paths that are excluded from MFA checks
   */
  excludedPaths?: string[];

  /**
   * Whether to enforce MFA for all authenticated routes
   * @default true
   */
  enforceForAll?: boolean;

  /**
   * The URL of the central web app where MFA verification is handled
   * If not provided, defaults to port detection or production URL
   */
  webAppUrl?: string;
}

/**
 * Creates a middleware handler that redirects unauthenticated users to the central web app login page
 */
export function createCentralizedAuthMiddleware(
  options: CentralizedAuthOptions
) {
  const {
    webAppUrl,
    publicPaths = [],
    excludeRootPath = false,
    isPublicPath,
    skipApiRoutes = true,
    mfa = {},
  } = options;

  const {
    enabled: mfaEnabled = true,
    protectedPaths: mfaProtectedPaths = [],
    excludedPaths: mfaExcludedPaths = [],
    enforceForAll: mfaEnforceForAll = true,
  } = mfa;

  return async function authMiddleware(
    req: NextRequest
  ): Promise<NextResponse> {
    try {
      // Make sure user session is always refreshed
      const { res, user } = await updateSession(req);

      // If we should skip API routes and the current path starts with /api, return without redirecting
      if (skipApiRoutes && req.nextUrl.pathname.startsWith('/api')) {
        // console.log('Skipping API route:', req.nextUrl.pathname);
        return res;
      } else {
        // console.log('Not skipping API route:', req.nextUrl.pathname);
      }

      // Determine if the current path is public
      const isPublic =
        (!excludeRootPath && req.nextUrl.pathname === '/') ||
        publicPaths.some((path) => req.nextUrl.pathname.startsWith(path)) ||
        (isPublicPath && isPublicPath(req.nextUrl.pathname));

      // If the user is not authenticated and the path is not public, redirect to the central login page
      if (!user && !isPublic) {
        const reqOrigin = req.nextUrl.origin;
        const path = req.nextUrl.pathname;

        // Encode the full returnUrl to redirect back after login
        const returnUrl = encodeURIComponent(
          `${reqOrigin}/verify-token?nextUrl=${path}`
        );

        // Redirect to the central login page with the returnUrl as a query parameter
        const loginUrl = `${webAppUrl}/login?returnUrl=${returnUrl}`;

        console.log('Redirecting to:', loginUrl);
        const redirectResponse = NextResponse.redirect(loginUrl);

        return redirectResponse;
      }

      // If user is authenticated and MFA is enabled, check MFA requirements
      if (user && mfaEnabled) {
        const mfaRedirect = await handleMFACheck(
          req,
          webAppUrl,
          mfaProtectedPaths,
          mfaExcludedPaths,
          mfaEnforceForAll
        );

        if (mfaRedirect) {
          return mfaRedirect;
        }
      }

      return res;
    } catch (error) {
      console.error('Error updating session:', error);
      return NextResponse.redirect(new URL('/', req.nextUrl));
    }
  };
}

export function createMFAMiddleware(options: MFAMiddlewareOptions = {}) {
  const {
    protectedPaths = [],
    excludedPaths = [],
    enforceForAll = true,
    webAppUrl,
  } = options;

  return async function mfaMiddleware(
    req: NextRequest
  ): Promise<NextResponse | null> {
    const pathname = req.nextUrl.pathname;

    // Skip MFA verification page itself to prevent redirect loop
    if (pathname.startsWith('/mfa')) {
      return null;
    }

    // Skip if path is excluded
    if (excludedPaths.some((path) => pathname.startsWith(path))) {
      return null;
    }

    // Check if this path requires MFA
    const needsMFA =
      enforceForAll || protectedPaths.some((path) => pathname.startsWith(path));

    if (!needsMFA) {
      return null;
    }

    try {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return null;

      // Check current AAL level
      const { data: assuranceLevel } =
        await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

      if (
        assuranceLevel?.currentLevel === 'aal1' &&
        assuranceLevel?.nextLevel === 'aal2'
      ) {
        // Determine the central web app URL
        const centralWebAppUrl =
          webAppUrl ||
          (process.env.NODE_ENV === 'production'
            ? 'https://tuturuuu.com'
            : 'http://localhost:7803');

        // Check if this is the central web app handling MFA
        const isCentralWebApp =
          req.nextUrl.port === '7803' ||
          req.nextUrl.hostname.includes('tuturuuu.com') ||
          req.nextUrl.origin === centralWebAppUrl;

        if (isCentralWebApp) {
          // Handle MFA verification in the login page
          const returnUrl = encodeURIComponent(
            req.nextUrl.pathname + req.nextUrl.search
          );
          const loginUrl = new URL('/login', req.nextUrl);
          loginUrl.searchParams.set('nextUrl', returnUrl);
          loginUrl.searchParams.set('mfa', 'required');

          return NextResponse.redirect(loginUrl);
        } else {
          // All other apps redirect to central web app for MFA verification
          const returnUrl = encodeURIComponent(req.nextUrl.href);
          const loginUrl = new URL('/login', centralWebAppUrl);
          loginUrl.searchParams.set('returnUrl', returnUrl);
          loginUrl.searchParams.set('mfa', 'required');

          return NextResponse.redirect(loginUrl);
        }
      }

      return null; // Continue processing
    } catch (error) {
      console.error('Error in MFA middleware:', error);

      // On error, sign out for security
      try {
        const supabase = await createClient();
        await supabase.auth.signOut();
      } catch (signOutError) {
        console.error('Error signing out in MFA middleware:', signOutError);
      }

      return null;
    }
  };
}

/**
 * Creates a redirect handler for the central web app to redirect back to the original app after login
 */
export function createReturnUrlHandler(
  req: NextRequest,
  user: SupabaseUser | null
): NextResponse | null {
  if (user) {
    // Get the returnUrl from the query parameters
    const returnUrl = req.nextUrl.searchParams.get('returnUrl');

    if (returnUrl) {
      try {
        // Decode and validate the returnUrl
        const decodedUrl = decodeURIComponent(returnUrl);
        const url = new URL(decodedUrl);

        // Redirect to the returnUrl
        const redirectResponse = NextResponse.redirect(url);

        return redirectResponse;
      } catch (error) {
        console.error('Invalid returnUrl:', error);
      }
    }
  }

  // Return null if we shouldn't redirect
  return null;
}
