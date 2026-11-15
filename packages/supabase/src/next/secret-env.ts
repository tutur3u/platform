import { getServerSupabaseUrl } from './common';

/**
 * Server-side Supabase URL and secret key for admin clients.
 *
 * Browser builds never load this module: the `#secret-env` import and the
 * `./next/secret-env` export resolve the `browser` condition to
 * `secret-env.browser.ts`, a stub with no environment reads. Server runtimes
 * (`node`, `react-server`, `edge-light`, `worker`, `workerd`) are listed before
 * `browser` so they always receive this reader.
 *
 * There is deliberately no fallback to the publishable key: a missing secret is
 * a configuration error.
 */
export function checkSecretEnvVariables(): {
  url: string;
  key: string;
} {
  const url = getServerSupabaseUrl();
  const key = process.env.SUPABASE_SECRET_KEY;

  if (!url) throw Error('Missing Supabase URL');
  if (!key) throw Error('Missing Supabase secret key');

  return { url, key };
}
