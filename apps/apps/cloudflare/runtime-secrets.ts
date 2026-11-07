import { assertWorkerStartup } from '@tuturuuu/start-bridge/startup';

export const requiredRuntimeSecrets = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_SECRET_KEY',
  'TUTURUUU_APP_COORDINATION_SECRET',
] as const;

export function assertRuntimeSecrets(env: object) {
  assertWorkerStartup({
    profile: 'production',
    env,
    requiredSecrets: requiredRuntimeSecrets,
  });
}
