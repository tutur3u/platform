import { createBrowserClient } from '@supabase/ssr';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@tuturuuu/types';
import { checkEnvVariables, getSupabaseCookieOptions } from './common';

const BROWSER_CLIENT_CACHE_KEY = '__tuturuuu_supabase_browser_client__';
const BROWSER_AUTH_OPTIONS = {
  auth: {
    experimental: {
      passkey: true,
    },
  },
} as const;

export type BrowserSupabaseClientConfig = {
  supabasePublishableKey?: string | null;
  supabaseUrl?: string | null;
};

type BrowserClientCache = typeof globalThis & {
  [BROWSER_CLIENT_CACHE_KEY]?: Map<string, SupabaseClient<Database>>;
};

function resolveBrowserClientConfig(config?: BrowserSupabaseClientConfig) {
  const env = checkEnvVariables({ useSecretKey: false });
  const url = config?.supabaseUrl?.trim() || env.url;
  const key = config?.supabasePublishableKey?.trim() || env.key;

  return { key, url };
}

function getBrowserClientCacheKey({ key, url }: { key: string; url: string }) {
  return `${url}\0${key}`;
}

function getOrCreateBrowserClient(
  config?: BrowserSupabaseClientConfig
): SupabaseClient<Database> {
  const clientConfig = resolveBrowserClientConfig(config);
  const clientCacheKey = getBrowserClientCacheKey(clientConfig);
  const cache = globalThis as BrowserClientCache;

  if (!cache[BROWSER_CLIENT_CACHE_KEY]) {
    cache[BROWSER_CLIENT_CACHE_KEY] = new Map();
  }

  const cachedClient = cache[BROWSER_CLIENT_CACHE_KEY].get(clientCacheKey);

  if (cachedClient) {
    return cachedClient;
  }

  const client = createBrowserClient<Database>(
    clientConfig.url,
    clientConfig.key,
    {
      ...BROWSER_AUTH_OPTIONS,
      cookieOptions: getSupabaseCookieOptions(clientConfig.url),
    }
  );

  cache[BROWSER_CLIENT_CACHE_KEY].set(clientCacheKey, client);

  return client;
}

export function createBaseBrowserClient<T = Database>(
  config?: BrowserSupabaseClientConfig
): SupabaseClient<T> {
  return getOrCreateBrowserClient(config) as unknown as SupabaseClient<T>;
}

export function createBaseDynamicBrowserClient(
  config?: BrowserSupabaseClientConfig
): SupabaseClient<any> {
  return getOrCreateBrowserClient(config);
}

export async function createBaseClientWithSession<T = Database>(
  session: Session,
  config?: BrowserSupabaseClientConfig
): Promise<SupabaseClient<T>> {
  const clientConfig = resolveBrowserClientConfig(config);
  const client = createBrowserClient<T>(clientConfig.url, clientConfig.key, {
    ...BROWSER_AUTH_OPTIONS,
    cookieOptions: getSupabaseCookieOptions(clientConfig.url),
  });

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
