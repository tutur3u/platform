import { createServerClient } from '@supabase/ssr';
import type { Database } from '@tuturuuu/types';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { checkEnvVariables } from './common';
import type { SupabaseJwtPayload } from './user';

export async function updateSession(request: NextRequest): Promise<{
  res: NextResponse;
  claims: SupabaseJwtPayload | null;
}> {
  try {
    let supabaseResponse = NextResponse.next({
      request,
    });

    const { url, key } = checkEnvVariables({ useSecretKey: false });
    const supabase = createServerClient<Database>(url, key, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
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
        },
      },
    });

    // IMPORTANT: Avoid writing any logic between createServerClient and
    // supabase.auth.getClaims(). A simple mistake could make it very hard to debug
    // issues with users being randomly logged out.

    const { data } = await supabase.auth.getClaims();

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
      res: NextResponse.next({
        request,
      }),
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
