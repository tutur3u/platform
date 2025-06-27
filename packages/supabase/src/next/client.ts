import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@tuturuuu/types/supabase';
import { checkEnvVariables } from './common';

const { url, key } = checkEnvVariables({ useServiceKey: false });

export function createDynamicClient(): SupabaseClient<
  Database,
  'public',
  Database['public']
> {
  return createBrowserClient(url, key);
}

export function createClient(): SupabaseClient<
  Database,
  'public',
  Database['public']
> {
  return createBrowserClient<Database>(url, key);
}

export type { SupabaseClient };
