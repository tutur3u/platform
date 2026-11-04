export const REQUIRED_RUNTIME_NAMES = [
  'CRON_SECRET',
  'SEPAY_OAUTH_CLIENT_ID',
  'SEPAY_OAUTH_CLIENT_SECRET',
  'SEPAY_OAUTH_STATE_SECRET',
  'SEPAY_OAUTH_TOKEN_ENCRYPTION_SECRET',
  'ENCRYPTION_MASTER_KEY',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'TUTURUUU_APP_COORDINATION_SECRET',
  'SUPABASE_SECRET_KEY',
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
] as const;

export type RuntimeEnvironment = Partial<
  Record<
    | (typeof REQUIRED_RUNTIME_NAMES)[number]
    | 'SEPAY_WEBHOOK_API_KEY'
    | 'SEPAY_WEBHOOK_SECRET',
    string
  >
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
  const webhookSecret = env.SEPAY_WEBHOOK_API_KEY ?? env.SEPAY_WEBHOOK_SECRET;
  if (!webhookSecret?.trim()) {
    throw new Error(
      'Missing required runtime binding: SEPAY_WEBHOOK_API_KEY or SEPAY_WEBHOOK_SECRET'
    );
  }
  if (
    env.TUTURUUU_APP_COORDINATION_SECRET ===
    'tuturuuu-local-development-app-coordination-secret'
  ) {
    throw new Error('Development coordination secret is forbidden');
  }
}
