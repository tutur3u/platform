import { SupabaseCookie, checkEnvVariables } from './common';
import { Database } from '@/types/supabase';
import { createServerClient } from '@supabase/ssr';
import { type NextRequest, NextResponse } from 'next/server';

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const { url, key } = checkEnvVariables({ useServiceKey: false });
  const supabase = createServerClient<Database>(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: SupabaseCookie[]) {
        cookiesToSet.forEach((cookie) => {
          request.cookies.set(cookie);
        });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { res: response, user };
}
