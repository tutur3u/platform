import { checkEnvVariables } from './common';
import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Database } from '@tuturuuu/types/supabase';

const { url, key } = checkEnvVariables({ useServiceKey: false });
const { key: serviceKey } = checkEnvVariables({ useServiceKey: true });

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

export function createAdminClient(): SupabaseClient<
  Database,
  'public',
  Database['public']
> {
  return createBrowserClient<Database>(url, serviceKey);
}

export type { SupabaseClient };
