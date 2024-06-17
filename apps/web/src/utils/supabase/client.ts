import { SupabaseKeys, checkEnvVariables } from './common';
import { Database } from '@/types/supabase';
import { createBrowserClient } from '@supabase/ssr';

export const createSupabaseClient = (keyEnvVar: string) => {
  const { url, key } = checkEnvVariables({
    useServiceKey: keyEnvVar === SupabaseKeys.Admin,
  });

  return createBrowserClient<Database>(url, key);
};

export const createDynamicClient = () => {
  const { url, key } = checkEnvVariables({ useServiceKey: false });
  return createBrowserClient(url, key);
};

export const createAdminClient = () => createSupabaseClient(SupabaseKeys.Admin);
export const createClient = () => createSupabaseClient(SupabaseKeys.Anon);
