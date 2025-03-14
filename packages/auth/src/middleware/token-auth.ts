import { createClient } from '@tuturuuu/supabase/next/server';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

interface TokenAuthOptions {
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
}

/**
 * Creates a middleware handler that authenticates users using cross-app tokens
 */
export function createTokenAuthMiddleware(options: TokenAuthOptions) {
  const {
    appId,
    publicPaths = [],
    excludeRootPath = false,
    isPublicPath,
    skipApiRoutes = true,
    allowedOrigins = [],
  } = options;

  return async function tokenAuthMiddleware(
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

    // Check for cross-app token in headers
    const token = req.headers.get('X-Cross-App-Token');

    if (!token) {
      // No token provided, return 401 Unauthorized
      return new NextResponse(
        JSON.stringify({ error: 'Authentication token required' }),
        { status: 401, headers: res.headers }
      );
    }

    // Validate the token
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
        return new NextResponse(
          JSON.stringify({ error: 'Invalid or expired token' }),
          { status: 401, headers: res.headers }
        );
      }

      // Token is valid, proceed with the request
      return res;
    } catch (error) {
      console.error('Unexpected error validating token:', error);
      return new NextResponse(
        JSON.stringify({ error: 'Authentication error' }),
        { status: 500, headers: res.headers }
      );
    }
  };
}

/**
 * Generates a cross-app token for a user to access another app
 */
export async function generateCrossAppToken(
  originApp: string,
  targetApp: string,
  expirySeconds: number = 300
): Promise<string | null> {
  try {
    const supabase = await createClient();

    // Get the current user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      console.error('Error getting user:', userError);
      return null;
    }

    // Call the RPC function to generate a token
    const { data, error } = await supabase.rpc('generate_cross_app_token', {
      p_user_id: user.id,
      p_origin_app: originApp,
      p_target_app: targetApp,
      p_expiry_seconds: expirySeconds,
    });

    if (error) {
      console.error('Error generating cross-app token:', error);
      return null;
    }

    return data as string;
  } catch (error) {
    console.error('Unexpected error generating cross-app token:', error);
    return null;
  }
}
