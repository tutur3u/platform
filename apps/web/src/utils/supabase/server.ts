import { checkEnvVariables } from './common';
import { Database } from '@/types/supabase';
import {
  CookieOptions,
  createBrowserClient,
  createServerClient,
} from '@supabase/ssr';
import { cookies } from 'next/headers';

function createCookieHandler(cookieStore: ReturnType<typeof cookies>) {
  return {
    get(name: string) {
      return cookieStore.get(name)?.value;
    },
    set(name: string, value: string, options: CookieOptions) {
      try {
        cookieStore.set({ name, value, ...options });
      } catch (error) {
        console.log(error);
      }
    },
    remove(name: string, options: CookieOptions) {
      try {
        cookieStore.set({ name, value: '', ...options });
      } catch (error) {
        console.log(error);
      }
    },
  };
}

export function createClient() {
  const { url, key } = checkEnvVariables({ useServiceKey: false });
  const cookieStore = cookies();
  return createServerClient<Database>(url, key, {
    cookies: createCookieHandler(cookieStore),
  });
}

export function createDynamicClient() {
  const { url, key } = checkEnvVariables({ useServiceKey: false });
  const cookieStore = cookies();
  return createServerClient(url, key, {
    cookies: createCookieHandler(cookieStore),
  });
}

export function createAdminClient() {
  const { url, key } = checkEnvVariables({ useServiceKey: true });
  return createBrowserClient(url, key);
}
