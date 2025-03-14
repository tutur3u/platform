import { updateSession } from '@tuturuuu/supabase/next/middleware';
import { SupabaseUser } from '@tuturuuu/supabase/next/user';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

// Export token-based authentication middleware
export * from './token-auth';
export * from './token-param-auth';

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

  /**
   * Origins that are allowed to make cross-origin requests
   * @default []
   */
  allowedOrigins?: string[];
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
    allowedOrigins = [],
  } = options;

  return async function authMiddleware(
    req: NextRequest
  ): Promise<NextResponse> {
    // Handle CORS preflight requests
    if (req.method === 'OPTIONS') {
      const response = new NextResponse(null, { status: 204 });
      const origin = req.headers.get('origin');

      // Add CORS headers
      response.headers.set('Access-Control-Allow-Credentials', 'true');

      // Only set specific origin if it's in allowed origins, otherwise use '*'
      if (
        origin &&
        (allowedOrigins.length === 0 || allowedOrigins.includes(origin))
      ) {
        response.headers.set('Access-Control-Allow-Origin', origin);
      }

      response.headers.set(
        'Access-Control-Allow-Methods',
        'GET,DELETE,PATCH,POST,PUT,OPTIONS'
      );
      response.headers.set(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, rsc, RSC, Next-Router-State-Tree, Next-Router-Prefetch, Next-Url, X-Cross-App-Token'
      );

      return response;
    }

    // Make sure user session is always refreshed
    const { res, user } = await updateSession(req);

    // Add CORS headers to all responses
    const origin = req.headers.get('origin');
    if (origin) {
      // If we have specific allowed origins, check against them
      if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
        res.headers.set('Access-Control-Allow-Origin', origin);
        res.headers.set('Access-Control-Allow-Credentials', 'true');
        res.headers.set(
          'Access-Control-Allow-Methods',
          'GET,DELETE,PATCH,POST,PUT,OPTIONS'
        );
        res.headers.set(
          'Access-Control-Allow-Headers',
          'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, rsc, RSC, Next-Router-State-Tree, Next-Router-Prefetch, Next-Url, X-Cross-App-Token'
        );
      }
    }

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
      const returnUrl = encodeURIComponent(`${reqOrigin}${path}`);

      // Redirect to the central login page with the returnUrl as a query parameter
      const loginUrl = `${webAppUrl}/login?returnUrl=${returnUrl}`;

      console.log('Redirecting to:', loginUrl);
      const redirectResponse = NextResponse.redirect(loginUrl);

      // Add CORS headers to the redirect response
      if (origin) {
        // Always set CORS headers for internal domains
        if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
          redirectResponse.headers.set('Access-Control-Allow-Origin', origin);
          redirectResponse.headers.set(
            'Access-Control-Allow-Credentials',
            'true'
          );
          redirectResponse.headers.set(
            'Access-Control-Allow-Methods',
            'GET,DELETE,PATCH,POST,PUT,OPTIONS'
          );
          redirectResponse.headers.set(
            'Access-Control-Allow-Headers',
            'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, rsc, RSC, Next-Router-State-Tree, Next-Router-Prefetch, Next-Url, X-Cross-App-Token'
          );
        }
      }

      return redirectResponse;
    }

    return res;
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

        // Add CORS headers to the redirect response
        const origin = req.headers.get('origin');
        if (origin) {
          redirectResponse.headers.set('Access-Control-Allow-Origin', origin);
          redirectResponse.headers.set(
            'Access-Control-Allow-Credentials',
            'true'
          );
          redirectResponse.headers.set(
            'Access-Control-Allow-Methods',
            'GET,DELETE,PATCH,POST,PUT,OPTIONS'
          );
          redirectResponse.headers.set(
            'Access-Control-Allow-Headers',
            'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, rsc, RSC, Next-Router-State-Tree, Next-Router-Prefetch, Next-Url, X-Cross-App-Token'
          );
        }

        return redirectResponse;
      } catch (error) {
        console.error('Invalid returnUrl:', error);
      }
    }
  }

  // Return null if we shouldn't redirect
  return null;
}
