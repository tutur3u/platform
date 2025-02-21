import { checkEnvVariables } from './common';
import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Database } from '@tutur3u/types/supabase';

const { url, key } = checkEnvVariables({ useServiceKey: false });

export function createDynamicClient() {
  return createBrowserClient(url, key);
}

export function createClient() {
  return createBrowserClient<Database>(url, key);
}

export type { SupabaseClient };
