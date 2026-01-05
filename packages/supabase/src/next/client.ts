import { checkEnvVariables } from './common';
import type { Database } from '@ncthub/types/supabase';
import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

const { url, key } = checkEnvVariables({ useServiceKey: false });
type TypedSupabaseClient = SupabaseClient<Database>;

export function createDynamicClient() {
  return createBrowserClient(url, key);
}

export function createClient() {
  return createBrowserClient<Database>(url, key);
}

export type { TypedSupabaseClient, SupabaseClient };
