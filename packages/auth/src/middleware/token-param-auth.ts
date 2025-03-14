import { createClient } from '@tuturuuu/supabase/next/server';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

interface TokenParamAuthOptions {
  /**
   * The app identifier for this application
   */
  appId: string;

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

  /**
   * The name of the query parameter that contains the token
   * @default 'token'
   */
  tokenParamName?: string;

  /**
   * The name of the cookie to store the token in
   * @default 'cross-app-token'
   */
  tokenCookieName?: string;

  /**
   * The expiry time for the token cookie in seconds
   * @default 300 (5 minutes)
   */
  tokenCookieExpiry?: number;
}

/**
 * Creates a middleware handler that authenticates users using cross-app tokens from URL parameters
 */
export function createTokenParamAuthMiddleware(options: TokenParamAuthOptions) {
  const {
    appId,
    publicPaths = [],
    excludeRootPath = false,
    isPublicPath,
    skipApiRoutes = true,
    allowedOrigins = [],
    tokenParamName = 'token',
    tokenCookieName = 'cross-app-token',
    tokenCookieExpiry = 300,
  } = options;

  return async function tokenParamAuthMiddleware(
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

    // Create a default response
    let res = NextResponse.next({
      request: req,
    });

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

    // If we should skip API routes and the current path starts with /api, return without validating
    if (skipApiRoutes && req.nextUrl.pathname.startsWith('/api')) {
      return res;
    }

    // Determine if the current path is public
    const isPublic =
      (!excludeRootPath && req.nextUrl.pathname === '/') ||
      publicPaths.some((path) => req.nextUrl.pathname.startsWith(path)) ||
      (isPublicPath && isPublicPath(req.nextUrl.pathname));

    // If the path is public, no need to validate token
    if (isPublic) {
      return res;
    }

    // Check for token in URL parameters
    const url = new URL(req.url);
    const token = url.searchParams.get(tokenParamName);

    // If token is present in URL, validate it and set a cookie
    if (token) {
      try {
        const supabase = await createClient();

        // Call the RPC function to validate the token
        const { data: userId, error } = await supabase.rpc(
          'validate_cross_app_token',
          {
            p_token: token,
            p_target_app: appId,
          }
        );

        if (error || !userId) {
          console.error('Error validating token:', error);
          // Token is invalid, continue with normal auth flow
          return res;
        }

        // Token is valid, set a cookie and redirect to the same URL without the token parameter
        const newUrl = new URL(req.url);
        newUrl.searchParams.delete(tokenParamName);

        const redirectRes = NextResponse.redirect(newUrl);

        // Set the token cookie
        redirectRes.cookies.set(tokenCookieName, token, {
          path: '/',
          maxAge: tokenCookieExpiry,
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
        });

        // Copy over CORS headers
        if (origin) {
          if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
            redirectRes.headers.set('Access-Control-Allow-Origin', origin);
            redirectRes.headers.set('Access-Control-Allow-Credentials', 'true');
            redirectRes.headers.set(
              'Access-Control-Allow-Methods',
              'GET,DELETE,PATCH,POST,PUT,OPTIONS'
            );
            redirectRes.headers.set(
              'Access-Control-Allow-Headers',
              'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, rsc, RSC, Next-Router-State-Tree, Next-Router-Prefetch, Next-Url, X-Cross-App-Token'
            );
          }
        }

        return redirectRes;
      } catch (error) {
        console.error('Unexpected error validating token from URL:', error);
        // Continue with normal auth flow
        return res;
      }
    }

    // Check for token in cookies
    const cookieToken = req.cookies.get(tokenCookieName)?.value;

    if (cookieToken) {
      try {
        const supabase = await createClient();

        // Call the RPC function to validate the token
        const { data: userId, error } = await supabase.rpc(
          'validate_cross_app_token',
          {
            p_token: cookieToken,
            p_target_app: appId,
          }
        );

        if (error || !userId) {
          console.error('Error validating token from cookie:', error);
          // Token is invalid, clear the cookie and continue with normal auth flow
          res.cookies.delete(tokenCookieName);
          return res;
        }

        // Token is valid, proceed with the request
        return res;
      } catch (error) {
        console.error('Unexpected error validating token from cookie:', error);
        // Clear the cookie and continue with normal auth flow
        res.cookies.delete(tokenCookieName);
        return res;
      }
    }

    // No token found, continue with normal auth flow
    return res;
  };
}
