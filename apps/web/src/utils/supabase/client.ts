import { createClient } from '@supabase/supabase-js';

export const createAdminClient = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;

  if (!url || !key) {
    alert('Missing Supabase URL or key');
    return;
  }

  return createClient(url, key);
};
