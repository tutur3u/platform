import { SupabaseCookie, checkEnvVariables } from './common';
import { createServerClient } from '@supabase/ssr';
import { Database } from '@tutur3u/types/supabase';
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

export const createAdminClient = () => {
  return createGenericClient(true);
};

export function createClient() {
  return createGenericClient(false);
}

export async function createDynamicClient() {
  const { url, key } = checkEnvVariables({ useServiceKey: false });
  const cookieStore = await cookies();
  return createServerClient(url, key, {
    cookies: createCookieHandler(cookieStore),
  });
}
