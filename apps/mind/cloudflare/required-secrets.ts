// Names only: a Worker missing any of these refuses to serve rather than run
// on a fallback. Values are never read beyond a presence check, never logged.
export const REQUIRED_SECRETS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_SECRET_KEY',
  'TUTURUUU_APP_COORDINATION_SECRET',
] as const;

// Names that configure an abuse guard. The `ABUSE_GUARD` service binding is
// declared in the Worker configuration, so it alone is not configuration.
// With no other name set the guard is off, as on Vercel; once any other name
// is set the configuration must be complete.
const ABUSE_GUARD_NAMES = [
  'ABUSE_GUARD',
  'ABUSE_GUARD_KEY_PEPPER',
  'ABUSE_GUARD_FAMILIES',
  'ABUSE_GUARD_BACKEND',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
] as const;

// The check runs on every request; log the notice once per isolate.
let guardOffNoticeLogged = false;

function isAbuseGuardUnconfigured(bindings: Record<string, unknown>) {
  return ABUSE_GUARD_NAMES.every(
    (name) => name === 'ABUSE_GUARD' || !nonEmpty(bindings[name])
  );
}

export function assertRequiredSecrets(env: object) {
  const bindings = env as Record<string, unknown>;
  const missing = REQUIRED_SECRETS.filter((name) => {
    const value = bindings[name];
    return typeof value !== 'string' || value.trim() === '';
  });
  const legacyUpstash =
    nonEmpty(bindings.UPSTASH_REDIS_REST_URL) &&
    nonEmpty(bindings.UPSTASH_REDIS_REST_TOKEN) &&
    bindings.ABUSE_GUARD_BACKEND === 'upstash';
  const serviceBinding =
    isObject(bindings.ABUSE_GUARD) &&
    nonEmpty(bindings.ABUSE_GUARD_KEY_PEPPER) &&
    nonEmpty(bindings.ABUSE_GUARD_FAMILIES);
  const guardOff =
    !legacyUpstash && !serviceBinding && isAbuseGuardUnconfigured(bindings);
  if (guardOff && !guardOffNoticeLogged) {
    guardOffNoticeLogged = true;
    console.warn(
      `[abuse-guard] not configured; guard skipped. Names: ${ABUSE_GUARD_NAMES.join(', ')}`
    );
  }
  if (!legacyUpstash && !serviceBinding && !guardOff) {
    const missingGuardNames = [
      ...(!isObject(bindings.ABUSE_GUARD) ? ['ABUSE_GUARD'] : []),
      ...(!nonEmpty(bindings.ABUSE_GUARD_KEY_PEPPER)
        ? ['ABUSE_GUARD_KEY_PEPPER']
        : []),
      ...(!nonEmpty(bindings.ABUSE_GUARD_FAMILIES)
        ? ['ABUSE_GUARD_FAMILIES']
        : []),
    ];
    throw new Error(
      `Missing valid abuse guard configuration; set either Upstash configuration or: ${missingGuardNames.join(', ')}`
    );
  }
  if (missing.length > 0) {
    throw new Error(`Missing required secrets: ${missing.join(', ')}`);
  }
}

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null;
}
