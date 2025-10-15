import { checkEnvVariables } from './common';
import type { Database } from '@ncthub/types/supabase';
import { createBrowserClient } from '@supabase/ssr';

const { url, key } = checkEnvVariables({ useServiceKey: false });

export function createDynamicClient() {
  return createBrowserClient(url, key);
}

export function createClient() {
  return createBrowserClient<Database>(url, key);
}

type TypedSupabaseClient = ReturnType<typeof createClient>;
type SupabaseClient = TypedSupabaseClient;

export type { TypedSupabaseClient, SupabaseClient };
