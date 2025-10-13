import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@tuturuuu/types/supabase';
import { checkEnvVariables } from './common';

const { url, key } = checkEnvVariables({ useSecretKey: false });
type TypedSupabaseClient = SupabaseClient<Database>;

export function createDynamicClient(): SupabaseClient<any> {
  return createBrowserClient(url, key);
}

export function createClient<T = Database>(): SupabaseClient<T> {
  return createBrowserClient<T>(url, key);
}

export type { SupabaseClient, TypedSupabaseClient };
