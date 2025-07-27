import type { CookieOptions } from '@supabase/ssr';

export type SupabaseCookie = {
  name: string;
  value: string;
  options: CookieOptions;
};

export function checkEnvVariables({
  useServiceKey = false,
}: {
  useServiceKey?: boolean;
}): {
  url: string;
  key: string;
} {
  const url = 'http://127.0.0.1:8001';
  const key =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

  if (!url) throw Error('Missing Supabase URL');
  if (!key) throw Error(`Missing Supabase key`);

  return { url, key };
}
