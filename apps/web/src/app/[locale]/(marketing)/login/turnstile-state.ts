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

export function shouldRequireTurnstileForLocalDevAuth({
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

export function getTurnstileClientErrorMessageKey(errorCode?: string) {
  return errorCode === TURNSTILE_DOMAIN_NOT_AUTHORIZED_ERROR
    ? 'captcha_domain_not_authorized'
    : 'captcha_error';
}

export function shouldRetryTurnstileClientError(errorCode?: string) {
  return errorCode !== TURNSTILE_DOMAIN_NOT_AUTHORIZED_ERROR;
}
