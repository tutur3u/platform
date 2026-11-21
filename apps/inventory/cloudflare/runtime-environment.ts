import type { AbuseGuardBinding } from '@tuturuuu/utils/abuse-guard/client';

export const REQUIRED_RUNTIME_NAMES = [
  'CRON_SECRET',
  'SEPAY_OAUTH_TOKEN_ENCRYPTION_SECRET',
  'ENCRYPTION_MASTER_KEY',
  'TUTURUUU_APP_COORDINATION_SECRET',
  'SUPABASE_SECRET_KEY',
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
] as const;

export type RuntimeEnvironment = Partial<
  Record<
    | (typeof REQUIRED_RUNTIME_NAMES)[number]
    | 'ABUSE_GUARD_FAMILIES'
    | 'ABUSE_GUARD_KEY_PEPPER'
    | 'UPSTASH_REDIS_REST_URL'
    | 'UPSTASH_REDIS_REST_TOKEN',
    string
  >
> & { ABUSE_GUARD?: AbuseGuardBinding };

export function getInventoryAbuseGuard(env: RuntimeEnvironment) {
  const binding = env.ABUSE_GUARD;
  const pepper = env.ABUSE_GUARD_KEY_PEPPER?.trim();
  const families = env.ABUSE_GUARD_FAMILIES;
  const assigned = families?.split(',').map((name) => name.trim());
  if (
    !binding ||
    !pepper ||
    pepper.length < 32 ||
    !['proxy', 'ratelimit', 'integrity'].every((name) =>
      assigned?.includes(name)
    )
  ) {
    return null;
  }
  return { binding, families, pepper };
}

export function assertRuntimeEnvironment(env: RuntimeEnvironment): void {
  if (process.env.NODE_ENV !== 'production') {
    throw new Error('Worker requires NODE_ENV=production');
  }
  for (const name of REQUIRED_RUNTIME_NAMES) {
    if (typeof env[name] !== 'string' || !env[name]?.trim()) {
      throw new Error(`Missing required runtime binding: ${name}`);
    }
  }
  const legacyRedis = !!(
    env.UPSTASH_REDIS_REST_URL?.trim() && env.UPSTASH_REDIS_REST_TOKEN?.trim()
  );
  if (!getInventoryAbuseGuard(env) && !legacyRedis) {
    throw new Error(
      'Inventory requires a configured abuse guard or legacy Redis'
    );
  }
  if (
    env.TUTURUUU_APP_COORDINATION_SECRET ===
    'tuturuuu-local-development-app-coordination-secret'
  ) {
    throw new Error('Development coordination secret is forbidden');
  }
}
