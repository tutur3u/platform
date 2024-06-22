import { SupabaseCookie, checkEnvVariables } from './common';
import { Database } from '@/types/supabase';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

function createCookieHandler(cookieStore: ReturnType<typeof cookies>) {
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

function createGenericClient(isAdmin: boolean) {
  const { url, key } = checkEnvVariables({ useServiceKey: isAdmin });
  const cookieStore = cookies();
  return createServerClient<Database>(url, key, {
    cookies: createCookieHandler(cookieStore),
  });
}

export const createAdminClient = () => {
  return createGenericClient(true);
};

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
