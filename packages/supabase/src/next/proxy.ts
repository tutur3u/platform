import { createServerClient } from '@supabase/ssr';
import type { Database } from '@tuturuuu/types';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import {
  getDuplicateSupabaseAuthCookieNames,
  getMalformedSupabaseAuthCookieNames,
  sanitizeSupabaseAuthCookies,
} from './auth-cookie-sanitizer';
import {
  checkEnvVariables,
  getHostOnlyCookieClearHeaders,
  getHostOnlyCookieClearHeadersForNames,
  getSupabaseCookieOptions,
} from './common';
import type { SupabaseJwtPayload } from './user';

export { getMalformedSupabaseAuthCookieNames };

export async function updateSession(request: NextRequest): Promise<{
  res: NextResponse;
  claims: SupabaseJwtPayload | null;
}> {
  try {
    let supabaseResponse = NextResponse.next({
      request,
    });

    const { url, key } = checkEnvVariables({ useSecretKey: false });
    const cookieOptions = getSupabaseCookieOptions(url, request.url);
    const duplicateAuthCookieNames = cookieOptions.domain
      ? getDuplicateSupabaseAuthCookieNames(request.headers.get('cookie'), url)
      : [];
    const supabase = createServerClient<Database>(url, key, {
      cookieOptions,
      cookies: {
        getAll() {
          return sanitizeSupabaseAuthCookies(
            request.cookies.getAll(),
            url,
            (name, options) => {
              request.cookies.set(name, '');
              supabaseResponse.cookies.set(name, '', options);
            }
          );
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) => {
            supabaseResponse.cookies.set(name, value, options);
          });
          getHostOnlyCookieClearHeaders(cookiesToSet).forEach((header) => {
            supabaseResponse.headers.append('set-cookie', header);
          });
        },
      },
    });

    // IMPORTANT: Avoid writing any logic between createServerClient and
    // supabase.auth.getClaims(). A simple mistake could make it very hard to debug
    // issues with users being randomly logged out.

    const { data } = await supabase.auth.getClaims();

    getHostOnlyCookieClearHeadersForNames(duplicateAuthCookieNames).forEach(
      (header) => {
        supabaseResponse.headers.append('set-cookie', header);
      }
    );

    // IMPORTANT: You *must* return the supabaseResponse object as it is. If you're
    // creating a new response object with NextResponse.next() make sure to:
    // 1. Pass the request in it, like so:
    //    const myNewResponse = NextResponse.next({ request })
    // 2. Copy over the cookies, like so:
    //    myNewResponse.cookies.setAll(supabaseResponse.cookies.getAll())
    // 3. Change the myNewResponse object to fit your needs, but avoid changing
    //    the cookies!
    // 4. Finally:
    //    return myNewResponse
    // If this is not done, you may be causing the browser and server to go out
    // of sync and terminate the user's session prematurely!

    return {
      res: supabaseResponse,
      claims: data?.claims || null,
    };
  } catch (error) {
    console.error('Error updating session:', error);
    return {
      res: NextResponse.next({ request }),
      claims: null,
    };
  }
}
