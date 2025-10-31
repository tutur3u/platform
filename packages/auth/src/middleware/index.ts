import { updateSession } from '@ncthub/supabase/next/proxy';
import { SupabaseUser } from '@ncthub/supabase/next/user';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

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
  isPublicPath?: (pathname: string) => boolean;

  /**
   * Whether to skip authentication checks for API routes
   * @default true
   */
  skipApiRoutes?: boolean;
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
  } = options;

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

      return res;
    } catch (error) {
      console.error('Error updating session:', error);
      return NextResponse.redirect(new URL('/', req.nextUrl));
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
