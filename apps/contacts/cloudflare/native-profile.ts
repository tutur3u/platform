// Required independently of the public asset binding so the app fails closed
// before loading routes if the release operator has not configured identity.
const requiredBindings = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_SECRET_KEY',
  'TUTURUUU_APP_COORDINATION_SECRET',
];

// The API proxy rate-limit store is optional: without it the proxy limiter
// fails open (the Chat precedent) and the edge abuse guard still applies.
const optionalRateLimitBindings = [
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
];

let reportedMissingRateLimitStore = false;

function hasBinding(env: object, name: string): boolean {
  const value: unknown = Reflect.get(env, name);
  return typeof value === 'string' && value.trim().length > 0;
}

export function hasContactsBindings(env: object): boolean {
  if (!requiredBindings.every((name) => hasBinding(env, name))) return false;
  const missing = optionalRateLimitBindings.filter(
    (name) => !hasBinding(env, name)
  );
  if (missing.length > 0 && !reportedMissingRateLimitStore) {
    reportedMissingRateLimitStore = true;
    // Names only, once per isolate; never a value.
    console.warn(
      `[contacts] proxy rate-limit store not configured (${missing.join(', ')}); the API proxy rate limit fails open`
    );
  }
  return true;
}

/** Test-only reset of the once-per-isolate report. */
export function resetContactsBindingReportForTests(): void {
  reportedMissingRateLimitStore = false;
}
