// Names only: a Worker missing any of these refuses to serve rather than run
// on a fallback. Values are never read beyond a presence check, never logged.
export const REQUIRED_SECRETS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_SECRET_KEY',
  'TUTURUUU_APP_COORDINATION_SECRET',
] as const;

export function assertRequiredSecrets(env: object) {
  const bindings = env as Record<string, unknown>;
  const missing = REQUIRED_SECRETS.filter((name) => {
    const value = bindings[name];
    return typeof value !== 'string' || value.trim() === '';
  });
  if (missing.length > 0) {
    throw new Error(`Missing required secrets: ${missing.join(', ')}`);
  }
}
