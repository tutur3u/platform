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

const INVENTORY_GUARD_FAMILIES = ['proxy', 'ratelimit', 'integrity'] as const;

function inventoryGuardFamilies(env: RuntimeEnvironment) {
  return env.ABUSE_GUARD_FAMILIES?.split(',').map((name) => name.trim());
}

export function getInventoryAbuseGuard(env: RuntimeEnvironment) {
  const binding = env.ABUSE_GUARD;
  const pepper = env.ABUSE_GUARD_KEY_PEPPER?.trim();
  const families = env.ABUSE_GUARD_FAMILIES;
  const assigned = inventoryGuardFamilies(env);
  if (
    !binding ||
    !pepper ||
    pepper.length < 32 ||
    !INVENTORY_GUARD_FAMILIES.every((name) => assigned?.includes(name))
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
  const assigned = inventoryGuardFamilies(env);
  const selectsGuard = INVENTORY_GUARD_FAMILIES.some((name) =>
    assigned?.includes(name)
  );
  if (!getInventoryAbuseGuard(env) && (selectsGuard || !legacyRedis)) {
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
