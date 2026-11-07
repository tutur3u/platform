// Refuse requests before loading application routes when deployment is incomplete.
const required = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_SECRET_KEY',
  'TUTURUUU_APP_COORDINATION_SECRET',
  'POLAR_ACCESS_TOKEN',
  'POLAR_WEBHOOK_SECRET',
];
export function missingRequiredBindings(env: object): boolean {
  if (process.env.NODE_ENV !== 'production') return true;
  return required.some((name) => {
    const value: unknown = Reflect.get(env, name);
    return typeof value !== 'string' || value.trim().length === 0;
  });
}
