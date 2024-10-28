import { SupabaseCookie, checkEnvVariables } from './common';
import { Database } from '@/types/supabase';
import { createServerClient } from '@supabase/ssr';
import { ReadonlyRequestCookies } from 'next/dist/server/web/spec-extension/adapters/request-cookies';
import { cookies } from 'next/headers';

function createCookieHandler(cookieStore: ReadonlyRequestCookies) {
  return {
    getAll() {
      return cookieStore.getAll();
    },
    setAll(cookiesToSet: SupabaseCookie[]) {
      cookiesToSet.forEach(({ name, value, options }) =>
        cookieStore.set(name, value, options)
      );
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
            return [];
          },
          setAll(_: SupabaseCookie[]) {},
        }
      : createCookieHandler(cookieStore),
  });
}

export function createAdminClient() {
  return createGenericClient(true);
}

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
