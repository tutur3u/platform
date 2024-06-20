import { checkEnvVariables } from './common';
import { Database } from '@/types/supabase';
import { createBrowserClient } from '@supabase/ssr';

const { url, key } = checkEnvVariables({ useServiceKey: false });

export const createSupabaseClient = () => {
  return createBrowserClient<Database>(url, key);
};

export const createDynamicClient = () => {
  return createBrowserClient(url, key);
};

export const createClient = () => createSupabaseClient();
