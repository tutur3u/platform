// Required independently of the public asset binding so the app fails closed
// before loading routes if the release operator has not configured identity.
const requiredBindings = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_SECRET_KEY',
  'TUTURUUU_APP_COORDINATION_SECRET',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
];

export function hasContactsBindings(env: object): boolean {
  return requiredBindings.every((name) => {
    const value: unknown = Reflect.get(env, name);
    return typeof value === 'string' && value.trim().length > 0;
  });
}
