import { CookieOptions } from '@supabase/ssr';

export type SupabaseCookie = {
  name: string;
  value: string;
  options: CookieOptions;
};

export function checkEnvVariables({
  useServiceKey = false,
}: {
  useServiceKey?: boolean;
}) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = useServiceKey
    ? process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
    : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url) throw Error('Missing Supabase URL');
  if (!key) throw Error(`Missing Supabase key: ${key}`);

  return { url, key };
}
