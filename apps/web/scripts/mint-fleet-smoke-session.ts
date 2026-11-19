import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { getSupabaseCookieOptions } from '@tuturuuu/supabase/next/common';
import type { Database } from '@tuturuuu/types';
import {
  fleetSmokeEmail,
  fleetSmokeFactorName,
  fleetSmokePasswordPattern,
  fleetSmokeRequestIdPattern,
  fleetSmokeTotp,
} from '../src/lib/auth/fleet-smoke/identity';

// Match the reviewed PRODUCTION_SUPABASE_URL and STAGING_SUPABASE_URL variables.
const allowedSupabaseOrigins = new Set([
  'https://nzamlzqfdwaaxdefwraj.supabase.co',
  'https://fxefojytwimjiqxseqag.supabase.co',
]);
const loopbackHosts = new Set(['localhost', '127.0.0.1', '[::1]']);

// The smoke runner consumes the result in memory. Cookies are credentials.
export async function mintFleetSmokeSession({
  appOrigin,
  supabaseUrl,
  supabasePublishableKey,
}: {
  appOrigin: string;
  supabaseUrl: string;
  supabasePublishableKey: string;
}) {
  const requestId = process.env.TUTURUUU_FLEET_SMOKE_ID ?? '';
  const password = process.env.TUTURUUU_FLEET_SMOKE_PASSWORD ?? '';
  const seed = process.env.TUTURUUU_FLEET_SMOKE_TOTP_SEED ?? '';
  const appUrl = new URL(appOrigin);
  if (
    !allowedSupabaseOrigins.has(supabaseUrl) ||
    appUrl.origin !== appOrigin ||
    (appUrl.protocol !== 'https:' &&
      !(appUrl.protocol === 'http:' && loopbackHosts.has(appUrl.hostname))) ||
    !fleetSmokeRequestIdPattern.test(requestId) ||
    !fleetSmokePasswordPattern.test(password)
  ) {
    throw new Error('Invalid fleet smoke configuration');
  }

  const cookies = new Map<
    string,
    { name: string; value: string; options: CookieOptions }
  >();
  const client = createServerClient<Database>(
    supabaseUrl,
    supabasePublishableKey,
    {
      cookieOptions: getSupabaseCookieOptions(supabaseUrl, appOrigin),
      cookies: {
        getAll: () => [...cookies.values()],
        setAll: (changes) => {
          for (const cookie of changes) {
            if (cookie.options.maxAge === 0) cookies.delete(cookie.name);
            else cookies.set(cookie.name, cookie);
          }
        },
      },
      global: {
        fetch: (url, init) => fetch(url, { ...init, redirect: 'error' }),
      },
    }
  );
  const email = fleetSmokeEmail(requestId);
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  });
  if (
    error ||
    data.user.id !== requestId ||
    data.user.email !== email ||
    data.user.app_metadata.tuturuuu_fleet_smoke !== true
  ) {
    throw new Error('Fleet smoke password sign-in failed');
  }

  const factors = await client.auth.mfa.listFactors();
  const factor = factors.data?.totp.find(
    (candidate) => candidate.friendly_name === fleetSmokeFactorName
  );
  if (factors.error || !factor)
    throw new Error('Fleet smoke factor unavailable');
  const verified = await client.auth.mfa.challengeAndVerify({
    factorId: factor.id,
    code: fleetSmokeTotp(seed),
  });
  if (verified.error) throw new Error('Fleet smoke TOTP verification failed');

  const workspace = await client
    .from('workspaces')
    .select('id')
    .eq('creator_id', requestId)
    .eq('personal', true)
    .eq('deleted', false)
    .single();
  if (workspace.error || !workspace.data || !cookies.size) {
    throw new Error('Fleet smoke workspace unavailable');
  }
  return { workspaceId: workspace.data.id, cookies: [...cookies.values()] };
}
