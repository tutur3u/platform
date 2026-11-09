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
  const legacy =
    bindings.ABUSE_GUARD_BACKEND === 'upstash' &&
    ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN'].every(
      (name) =>
        typeof bindings[name] === 'string' && bindings[name].trim() !== ''
    );
  const service =
    typeof bindings.ABUSE_GUARD === 'object' &&
    bindings.ABUSE_GUARD !== null &&
    typeof bindings.ABUSE_GUARD_KEY_PEPPER === 'string' &&
    bindings.ABUSE_GUARD_KEY_PEPPER.trim() !== '' &&
    typeof bindings.ABUSE_GUARD_FAMILIES === 'string' &&
    bindings.ABUSE_GUARD_FAMILIES.trim() !== '';
  if (!legacy && !service) {
    const missingGuard = [
      ...(typeof bindings.ABUSE_GUARD !== 'object' ||
      bindings.ABUSE_GUARD === null
        ? ['ABUSE_GUARD']
        : []),
      ...(typeof bindings.ABUSE_GUARD_KEY_PEPPER !== 'string' ||
      !bindings.ABUSE_GUARD_KEY_PEPPER.trim()
        ? ['ABUSE_GUARD_KEY_PEPPER']
        : []),
      ...(typeof bindings.ABUSE_GUARD_FAMILIES !== 'string' ||
      !bindings.ABUSE_GUARD_FAMILIES.trim()
        ? ['ABUSE_GUARD_FAMILIES']
        : []),
      ...(bindings.ABUSE_GUARD_BACKEND !== 'upstash'
        ? ['ABUSE_GUARD_BACKEND']
        : []),
      ...['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN'].filter(
        (name) => typeof bindings[name] !== 'string' || !bindings[name].trim()
      ),
    ];
    throw new Error(
      `Missing abuse guard configuration: ${[...new Set(missingGuard)].join(', ')}`
    );
  }
}
