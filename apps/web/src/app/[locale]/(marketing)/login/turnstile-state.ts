import { resolveTurnstileClientState } from '@tuturuuu/turnstile/client';

const LOCAL_SUPABASE_HOSTS = new Set([
  '0.0.0.0',
  '127.0.0.1',
  '::1',
  '[::1]',
  'localhost',
]);
const TURNSTILE_DOMAIN_NOT_AUTHORIZED_ERROR = '110200';

export function isLocalSupabaseUrl(rawUrl?: string | null) {
  if (!rawUrl?.trim()) {
    return false;
  }

  try {
    const url = new URL(rawUrl);
    return LOCAL_SUPABASE_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

export function shouldRequireTurnstileForDevAuth({
  devMode,
  localE2EAuthBypass,
  supabaseUrl,
}: {
  devMode: boolean;
  localE2EAuthBypass: boolean;
  supabaseUrl?: string | null;
}) {
  return devMode && !localE2EAuthBypass && !isLocalSupabaseUrl(supabaseUrl);
}

export function shouldBypassTurnstileForLocalSupabaseDevAuth({
  devMode,
  localE2EAuthBypass,
  supabaseUrl,
}: {
  devMode: boolean;
  localE2EAuthBypass: boolean;
  supabaseUrl?: string | null;
}) {
  return devMode && !localE2EAuthBypass && isLocalSupabaseUrl(supabaseUrl);
}

export function shouldHonorLocalE2EAuthBypassForLogin({
  devMode,
  publicLocalE2EAuthBypass,
  supabaseUrl,
}: {
  devMode: boolean;
  publicLocalE2EAuthBypass: boolean;
  supabaseUrl?: string | null;
}) {
  return devMode && publicLocalE2EAuthBypass && isLocalSupabaseUrl(supabaseUrl);
}

export function resolveLoginTurnstileClientState({
  devMode,
  localE2EAuthBypass,
  siteKey,
  supabaseUrl,
}: {
  devMode: boolean;
  localE2EAuthBypass: boolean;
  siteKey?: string | null;
  supabaseUrl?: string | null;
}) {
  const bypassLocalSupabaseTurnstile =
    shouldBypassTurnstileForLocalSupabaseDevAuth({
      devMode,
      localE2EAuthBypass,
      supabaseUrl,
    });

  return resolveTurnstileClientState({
    devMode: devMode || localE2EAuthBypass,
    requireInDev: shouldRequireTurnstileForDevAuth({
      devMode,
      localE2EAuthBypass,
      supabaseUrl,
    }),
    requireInDevWhenConfigured:
      !localE2EAuthBypass && !bypassLocalSupabaseTurnstile,
    siteKey,
  });
}

export function getTurnstileClientErrorMessageKey(errorCode?: string) {
  return errorCode === TURNSTILE_DOMAIN_NOT_AUTHORIZED_ERROR
    ? 'captcha_domain_not_authorized'
    : 'captcha_error';
}

export function shouldRetryTurnstileClientError(errorCode?: string) {
  return errorCode !== TURNSTILE_DOMAIN_NOT_AUTHORIZED_ERROR;
}
