import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@tuturuuu/types/supabase';
import { checkEnvVariables } from './common';

const { url, key } = checkEnvVariables({ useServiceKey: false });

export function createDynamicClient() {
  return createBrowserClient(url, key);
}

export function createClient() {
  return createBrowserClient<Database>(url, key);
}

type TypedSupabaseClient = ReturnType<typeof createClient>;

export type { TypedSupabaseClient, SupabaseClient };
