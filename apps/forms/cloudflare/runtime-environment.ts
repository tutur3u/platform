export const REQUIRED_RUNTIME_NAMES = [
  'TURNSTILE_SECRET_KEY',
  'NEXT_PUBLIC_TURNSTILE_SITE_KEY',
  'TUTURUUU_APP_COORDINATION_SECRET',
  'SUPABASE_SECRET_KEY',
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
] as const;

export type RuntimeEnvironment = Partial<
  Record<(typeof REQUIRED_RUNTIME_NAMES)[number], string>
>;

export function assertRuntimeEnvironment(env: RuntimeEnvironment): void {
  if (process.env.NODE_ENV !== 'production') {
    throw new Error('Worker requires NODE_ENV=production');
  }
  for (const name of REQUIRED_RUNTIME_NAMES) {
    if (typeof env[name] !== 'string' || !env[name]?.trim()) {
      throw new Error(`Missing required runtime binding: ${name}`);
    }
  }
  if (
    env.TUTURUUU_APP_COORDINATION_SECRET ===
    'tuturuuu-local-development-app-coordination-secret'
  ) {
    throw new Error('Development coordination secret is forbidden');
  }
}
