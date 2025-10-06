import type { CookieOptions } from '@supabase/ssr';

export type SupabaseCookie = {
  name: string;
  value: string;
  options: CookieOptions;
};

export function checkEnvVariables({
  useSecretKey = false,
}: {
  useSecretKey?: boolean;
}): {
  url: string;
  key: string;
} {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = useSecretKey
    ? process.env.SUPABASE_SECRET_KEY
    : process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url) throw Error('Missing Supabase URL');
  if (!key) throw Error(`Missing Supabase key`);

  return { url, key };
}
