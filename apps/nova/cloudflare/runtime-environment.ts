export const REQUIRED_RUNTIME_NAMES = [
  'TUTURUUU_APP_COORDINATION_SECRET',
  'SUPABASE_SECRET_KEY',
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
] as const;

type RuntimeBindingName =
  | (typeof REQUIRED_RUNTIME_NAMES)[number]
  | 'UPSTASH_REDIS_REST_URL'
  | 'UPSTASH_REDIS_REST_TOKEN'
  | 'ABUSE_GUARD'
  | 'ABUSE_GUARD_KEY_PEPPER'
  | 'ABUSE_GUARD_FAMILIES';

// Generated binding interfaces enumerate names; they need no open index signature.
export type RuntimeEnvironment = Partial<Record<RuntimeBindingName, unknown>>;

// Names that configure an abuse guard. The `ABUSE_GUARD` service binding is
// declared in the Worker configuration, so it alone is not configuration.
// With no other name set the guard is off, as on Vercel; once any other name
// is set the configuration must be complete.
const ABUSE_GUARD_NAMES = [
  'ABUSE_GUARD',
  'ABUSE_GUARD_KEY_PEPPER',
  'ABUSE_GUARD_FAMILIES',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
] as const;

// The check runs on every request; log the notice once per isolate.
let guardOffNoticeLogged = false;

function isAbuseGuardUnconfigured(env: RuntimeEnvironment) {
  return ABUSE_GUARD_NAMES.every((name) => {
    if (name === 'ABUSE_GUARD') return true;
    const value = env[name];
    return typeof value !== 'string' || value.trim() === '';
  });
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
  const legacy =
    typeof env.UPSTASH_REDIS_REST_URL === 'string' &&
    !!env.UPSTASH_REDIS_REST_URL.trim() &&
    typeof env.UPSTASH_REDIS_REST_TOKEN === 'string' &&
    !!env.UPSTASH_REDIS_REST_TOKEN.trim();
  const binding =
    typeof env.ABUSE_GUARD === 'object' && env.ABUSE_GUARD !== null;
  const configured =
    binding &&
    typeof env.ABUSE_GUARD_KEY_PEPPER === 'string' &&
    !!env.ABUSE_GUARD_KEY_PEPPER.trim() &&
    typeof env.ABUSE_GUARD_FAMILIES === 'string' &&
    !!env.ABUSE_GUARD_FAMILIES.trim();
  const guardOff = !legacy && !configured && isAbuseGuardUnconfigured(env);
  if (guardOff && !guardOffNoticeLogged) {
    guardOffNoticeLogged = true;
    console.warn(
      `[abuse-guard] not configured; guard skipped. Names: ${ABUSE_GUARD_NAMES.join(', ')}`
    );
  }
  if (!legacy && !configured && !guardOff) {
    const missing = binding
      ? (['ABUSE_GUARD_KEY_PEPPER', 'ABUSE_GUARD_FAMILIES'] as const).filter(
          (name) => typeof env[name] !== 'string' || !String(env[name]).trim()
        )
      : ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN'];
    throw new Error(`Missing abuse guard runtime names: ${missing.join(', ')}`);
  }
  if (
    env.TUTURUUU_APP_COORDINATION_SECRET ===
    'tuturuuu-local-development-app-coordination-secret'
  ) {
    throw new Error('Development coordination secret is forbidden');
  }
}
