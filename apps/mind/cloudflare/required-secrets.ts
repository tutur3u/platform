// Names only: a Worker missing any of these refuses to serve rather than run
// on a fallback. Values are never read beyond a presence check, never logged.
export const REQUIRED_SECRETS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_SECRET_KEY',
  'TUTURUUU_APP_COORDINATION_SECRET',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
] as const;

export function assertRequiredSecrets(env: object) {
  const bindings = env as Record<string, unknown>;
  const missing = REQUIRED_SECRETS.filter((name) => {
    const value = bindings[name];
    return typeof value !== 'string' || value.trim() === '';
  });
  if (
    !('ABUSE_GUARD_BACKEND' in env) ||
    env.ABUSE_GUARD_BACKEND !== 'upstash'
  ) {
    throw new Error('Mind production requires ABUSE_GUARD_BACKEND=upstash');
  }
  if (missing.length > 0) {
    throw new Error(`Missing required secrets: ${missing.join(', ')}`);
  }
}
