import { createBrowserClient, createServerClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@tuturuuu/types/supabase';
import type { ReadonlyRequestCookies } from 'next/dist/server/web/spec-extension/adapters/request-cookies';
import { cookies } from 'next/headers';
import { checkEnvVariables, type SupabaseCookie } from './common';

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

export function createAdminClient({
  noCookie = false,
}: {
  noCookie?: boolean;
} = {}):
  | SupabaseClient<Database, 'public', Database['public']>
  | Promise<SupabaseClient<Database, 'public', Database['public']>> {
  if (noCookie) {
    const { url, key } = checkEnvVariables({ useServiceKey: true });
    return createBrowserClient<Database>(url, key);
  }

  return createGenericClient(true);
}

export function createClient(): Promise<
  SupabaseClient<Database, 'public', Database['public']>
> {
  return createGenericClient(false);
}

export async function createDynamicClient(): Promise<
  // biome-ignore lint/suspicious/noExplicitAny: <any is expected for dynamic client>
  SupabaseClient<any, 'public', any>
> {
  const { url, key } = checkEnvVariables({ useServiceKey: false });
  const cookieStore = await cookies();
  return createServerClient(url, key, {
    cookies: createCookieHandler(cookieStore),
  });
}
