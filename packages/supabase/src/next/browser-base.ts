import { createBrowserClient } from '@supabase/ssr';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@tuturuuu/types';
import { checkEnvVariables } from './common';

const { url, key } = checkEnvVariables({ useSecretKey: false });
const BROWSER_CLIENT_CACHE_KEY = '__tuturuuu_supabase_browser_client__';

type BrowserClientCache = typeof globalThis & {
  [BROWSER_CLIENT_CACHE_KEY]?: SupabaseClient<Database>;
};

function getOrCreateBrowserClient(): SupabaseClient<Database> {
  const cache = globalThis as BrowserClientCache;

  if (!cache[BROWSER_CLIENT_CACHE_KEY]) {
    cache[BROWSER_CLIENT_CACHE_KEY] = createBrowserClient<Database>(url, key);
  }

  return cache[BROWSER_CLIENT_CACHE_KEY];
}

export function createBaseBrowserClient<T = Database>(): SupabaseClient<T> {
  return getOrCreateBrowserClient() as unknown as SupabaseClient<T>;
}

export function createBaseDynamicBrowserClient(): SupabaseClient<any> {
  return getOrCreateBrowserClient();
}

export async function createBaseClientWithSession<T = Database>(
  session: Session
): Promise<SupabaseClient<T>> {
  const client = createBrowserClient<T>(url, key);

  const { data, error } = await client.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });

  if (error || !data.session) {
    throw new Error(
      `Failed to set session: ${error?.message || 'No session returned'}`
    );
  }

  return client;
}

export function __resetBrowserClientCacheForTests() {
  delete (globalThis as BrowserClientCache)[BROWSER_CLIENT_CACHE_KEY];
}
