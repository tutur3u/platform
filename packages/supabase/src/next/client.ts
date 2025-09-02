import { checkEnvVariables } from './common';
import { Database } from '@ncthub/types/supabase';
import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

const { url, key } = checkEnvVariables({ useServiceKey: false });

export function createDynamicClient(): SupabaseClient<any, 'public', any> {
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
