/** Secrets the Worker cannot serve correctly without. Names only. */
export const CALENDAR_REQUIRED_SECRETS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_SECRET_KEY',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_REDIRECT_URI',
  'MICROSOFT_CLIENT_ID',
  'MICROSOFT_CLIENT_SECRET',
  'MICROSOFT_TENANT_ID',
  'CRON_SECRET',
  'ENCRYPTION_MASTER_KEY',
  'CLOUDFLARE_COORDINATION_URL',
  'CLOUDFLARE_COORDINATION_TOKEN',
  'TUTURUUU_AZURE_TENANT_ID',
] as const;

export function missingCalendarSecrets(env: object) {
  const values = env as Record<string, unknown>;
  return CALENDAR_REQUIRED_SECRETS.filter((name) => {
    const value = values[name];
    return typeof value !== 'string' || !value.trim();
  });
}

/** Refuses to serve from a misconfigured deployment without naming the gap. */
export function missingSecretsResponse(
  profile: string | undefined,
  env: object
) {
  if (profile === 'development') return null;
  const missing = missingCalendarSecrets(env);
  if (!missing.length) return null;
  console.error(`Calendar missing required secrets: ${missing.join(', ')}`);
  return new Response('Service misconfigured', {
    status: 503,
    headers: { 'Cache-Control': 'no-store' },
  });
}
