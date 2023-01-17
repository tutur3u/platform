import { createClient } from '@supabase/supabase-js';

export const supabase = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    alert('Missing Supabase URL or key');
    return;
  }

  return createClient(url, key);
};

export const supabaseAdmin = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_KEY;

  if (!url || !key) {
    alert('Missing Supabase URL or key');
    return;
  }

  return createClient(url, key);
};
