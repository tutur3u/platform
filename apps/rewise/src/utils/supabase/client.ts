import { checkEnvVariables } from './common';
import { Database } from '@repo/types/supabase';
import { createBrowserClient } from '@supabase/ssr';

const { url, key } = checkEnvVariables({ useServiceKey: false });

export function createDynamicClient() {
  return createBrowserClient(url, key);
}

export function createClient() {
  return createBrowserClient<Database>(url, key);
}
