import { SupabaseCookie, checkEnvVariables } from './common';
import { Database } from '@/types/supabase';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

function createCookieHandler(cookieStore: ReturnType<typeof cookies>) {
  return {
    getAll() {
      return cookieStore.getAll();
    },
    setAll: async (cookiesToSet: SupabaseCookie[]) => {
      try {
        // set the cookies exactly as they appear in the cookiesToSet array
        cookiesToSet.forEach((cookie) => {
          cookieStore.set(cookie);
        });
      } catch (error) {
        console.log(error);
      }
    },
  };
}

function createGenericClient(isAdmin: boolean) {
  const { url, key } = checkEnvVariables({ useServiceKey: isAdmin });
  const cookieStore = cookies();
  return createServerClient<Database>(url, key, {
    cookies: createCookieHandler(cookieStore),
  });
}

export function createAdminClient() {
  return createGenericClient(true);
}

export function createClient() {
  return createGenericClient(false);
}

export function createDynamicClient() {
  const { url, key } = checkEnvVariables({ useServiceKey: false });
  const cookieStore = cookies();
  return createServerClient(url, key, {
    cookies: createCookieHandler(cookieStore),
  });
}
