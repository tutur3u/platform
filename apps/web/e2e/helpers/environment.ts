export const LOCAL_E2E_PORTLESS_PORT = '1355';
export const LOCAL_E2E_BASE_URL = `https://tuturuuu.localhost:${LOCAL_E2E_PORTLESS_PORT}`;
export const LOCAL_E2E_SUPABASE_URL = 'http://127.0.0.1:8001';
export const LOCAL_E2E_DOCKER_SUPABASE_URL = 'http://host.docker.internal:8001';
export const LOCAL_E2E_SUPABASE_PUBLISHABLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
export const LOCAL_E2E_SUPABASE_SECRET_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
export const LOCAL_E2E_APP_COORDINATION_SECRET =
  'local-e2e-app-coordination-secret';
export const LOCAL_E2E_CRON_SECRET = 'local-e2e-cron-secret';

export const SAFE_LOCAL_WEB_ORIGINS = new Set([
  'http://127.0.0.1:7803',
  'http://localhost:7803',
  'https://tuturuuu.localhost',
  `https://tuturuuu.localhost:${LOCAL_E2E_PORTLESS_PORT}`,
]);
export const SAFE_LOCAL_SUPABASE_ORIGINS = new Set([
  'http://127.0.0.1:8001',
  'http://host.docker.internal:8001',
  'http://localhost:8001',
]);

function getUrlOrigin(name: string, value: string) {
  try {
    return new URL(value).origin;
  } catch {
    throw new Error(`Invalid ${name} URL for E2E: ${value}`);
  }
}

function assertAllowedOrigin(
  name: string,
  value: string,
  allowedOrigins: Set<string>
) {
  const origin = getUrlOrigin(name, value);

  if (!allowedOrigins.has(origin)) {
    throw new Error(`Refusing to run E2E with non-local ${name}: ${origin}`);
  }

  return origin;
}

function assertNoCloudSupabaseReference(name: string, value?: string) {
  if (!value) {
    return;
  }

  if (/supabase\.(co|in)/iu.test(value)) {
    throw new Error(`Refusing to run E2E with cloud ${name}: ${value}`);
  }
}

export function assertSafeE2EEnvironment(env: NodeJS.ProcessEnv = process.env) {
  const baseUrl = env.BASE_URL ?? LOCAL_E2E_BASE_URL;
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL ?? LOCAL_E2E_SUPABASE_URL;

  assertAllowedOrigin('BASE_URL', baseUrl, SAFE_LOCAL_WEB_ORIGINS);
  assertAllowedOrigin(
    'NEXT_PUBLIC_SUPABASE_URL',
    supabaseUrl,
    SAFE_LOCAL_SUPABASE_ORIGINS
  );

  for (const key of [
    'DOCKER_INTERNAL_SUPABASE_URL',
    'SUPABASE_SERVER_URL',
    'SUPABASE_URL',
  ]) {
    const value = env[key];
    if (value) {
      assertAllowedOrigin(key, value, SAFE_LOCAL_SUPABASE_ORIGINS);
    }
  }

  for (const key of [
    'DATABASE_URL',
    'DIRECT_URL',
    'NEXT_PUBLIC_SUPABASE_URL',
    'POSTGRES_URL',
    'SUPABASE_SERVER_URL',
    'SUPABASE_URL',
  ]) {
    assertNoCloudSupabaseReference(key, env[key]);
  }

  return {
    baseUrl,
    supabaseUrl,
  };
}
