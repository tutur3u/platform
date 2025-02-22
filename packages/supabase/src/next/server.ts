import { SupabaseCookie, checkEnvVariables } from './common';
import { createServerClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Database } from '@tuturuuu/types/supabase';
import type { ReadonlyRequestCookies } from 'next/dist/server/web/spec-extension/adapters/request-cookies';
import { cookies } from 'next/headers';

function createCookieHandler(cookieStore: ReadonlyRequestCookies) {
  return {
    getAll() {
      return cookieStore.getAll();
    },
    setAll(cookiesToSet: SupabaseCookie[]) {
      try {
        cookiesToSet.forEach(({ name, value, options }) =>
          cookieStore.set(name, value, options)
        );
      } catch {
        // The `setAll` method was called from a Server Component.
        // This can be ignored if you have middleware refreshing
        // user sessions.
      }
    },
  };
}

async function createGenericClient(isAdmin: boolean) {
  const { url, key } = checkEnvVariables({ useServiceKey: isAdmin });
  const cookieStore = await cookies();
  return createServerClient<Database>(url, key, {
    cookies: isAdmin
      ? {
          getAll() {
            return [] as SupabaseCookie[];
          },
          // eslint-disable-next-line no-unused-vars
          setAll(_: SupabaseCookie[]) {},
        }
      : createCookieHandler(cookieStore),
  });
}

export function createAdminClient(): Promise<
  SupabaseClient<Database, 'public', Database['public']>
> {
  return createGenericClient(true);
}

export function createClient(): Promise<
  SupabaseClient<Database, 'public', Database['public']>
> {
  return createGenericClient(false);
}

export async function createDynamicClient(): Promise<
  SupabaseClient<any, 'public', any>
> {
  const { url, key } = checkEnvVariables({ useServiceKey: false });
  const cookieStore = await cookies();
  return createServerClient(url, key, {
    cookies: createCookieHandler(cookieStore),
  });
}
