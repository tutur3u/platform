const LOCAL_E2E_AUTH_BYPASS_ENV = 'TUTURUUU_LOCAL_E2E_AUTH_BYPASS';

const LOCAL_WEB_ORIGINS = new Set([
  'http://127.0.0.1:7803',
  'http://localhost:7803',
]);

const LOCAL_SUPABASE_ORIGINS = new Set([
  'http://127.0.0.1:8001',
  'http://host.docker.internal:8001',
  'http://localhost:8001',
]);

function isEnabled(value?: string) {
  return /^(1|true|yes)$/iu.test(String(value ?? ''));
}

function getOrigin(value?: string) {
  if (!value) {
    return null;
  }

  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

export function isLocalE2EAuthBypassEnabled(
  env: NodeJS.ProcessEnv = process.env
) {
  if (!isEnabled(env[LOCAL_E2E_AUTH_BYPASS_ENV])) {
    return false;
  }

  const webOrigin = getOrigin(env.BASE_URL);
  const supabaseOrigin = getOrigin(env.NEXT_PUBLIC_SUPABASE_URL);

  return (
    webOrigin !== null &&
    supabaseOrigin !== null &&
    LOCAL_WEB_ORIGINS.has(webOrigin) &&
    LOCAL_SUPABASE_ORIGINS.has(supabaseOrigin)
  );
}
