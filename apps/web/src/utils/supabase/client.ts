import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@supabase/supabase-js';

export const createAdminClient = (): SupabaseClient | undefined => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;

  if (!url || !key) {
    throw Error('Missing Supabase URL or key');
  }

  return createClient(url, key);
};
