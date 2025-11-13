'use server';

import { createBrowserClient, createServerClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@tuturuuu/types';
import type { RequestCookie } from 'next/dist/compiled/@edge-runtime/cookies';
import type { ReadonlyRequestCookies } from 'next/dist/server/web/spec-extension/adapters/request-cookies';
import { cookies } from 'next/headers';
import { checkEnvVariables, type SupabaseCookie } from './common';

function createCookieHandler(cookieStore: ReadonlyRequestCookies): {
  getAll(): RequestCookie[];
  setAll(cookiesToSet: SupabaseCookie[]): void;
} {
  return {
    getAll() {
      return cookieStore.getAll();
    },
    setAll(cookiesToSet: SupabaseCookie[]) {
      try {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookieStore.set(name, value, options);
        });
      } catch {
        // The `setAll` method was called from a Server Component.
        // This can be ignored if you have middleware refreshing
        // user sessions.
      }
    },
  };
}

async function createGenericClient<T = Database>(
  isAdmin: boolean
): Promise<SupabaseClient<T>> {
  const { url, key } = checkEnvVariables({ useSecretKey: isAdmin });
  const cookieStore = await cookies();
  return createServerClient<T>(url, key, {
    cookies: isAdmin
      ? {
          getAll() {
            return [] as SupabaseCookie[];
          },

          setAll(_: SupabaseCookie[]) {},
        }
      : createCookieHandler(cookieStore),
  });
}

export function createAdminClient<T = Database>({
  noCookie = false,
}: {
  noCookie?: boolean;
} = {}): SupabaseClient<T> | Promise<SupabaseClient<T>> {
  if (noCookie) {
    const { url, key } = checkEnvVariables({ useSecretKey: true });
    return createBrowserClient<T>(url, key);
  }

  return createGenericClient<T>(true);
}

export function createAnonClient<T = Database>():
  | SupabaseClient<T>
  | Promise<SupabaseClient<T>> {
  const { url, key } = checkEnvVariables({ useSecretKey: false });
  return createBrowserClient<T>(url, key, {
    global: {
      headers: {
        Authorization: `Bearer ${key}`,
      },
    },
    // disable client-side session behaviors in server functions
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}

export function createClient<T = Database>(): Promise<SupabaseClient<T>> {
  return createGenericClient<T>(false);
}

export async function createDynamicClient(): Promise<SupabaseClient<any>> {
  const { url, key } = checkEnvVariables({ useSecretKey: false });
  const cookieStore = await cookies();
  return createServerClient(url, key, {
    cookies: createCookieHandler(cookieStore),
  });
}

export async function createDynamicAdminClient(): Promise<SupabaseClient<any>> {
  const { url, key } = checkEnvVariables({ useSecretKey: true });
  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return [] as SupabaseCookie[];
      },

      setAll(_: SupabaseCookie[]) {},
    },
  });
}
