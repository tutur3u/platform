import { assertWorkerStartup } from '@tuturuuu/start-bridge/startup';
import { assertSnsVerification } from './sns-startup.ts';

export const requiredRuntimeSecrets = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_SECRET_KEY',
  'TUTURUUU_APP_COORDINATION_SECRET',
  'MAIL_CONNECTED_ACCOUNTS_KEY',
  'MAIL_R2_ACCOUNT_ID',
  'MAIL_R2_ACCESS_KEY_ID',
  'MAIL_R2_SECRET_ACCESS_KEY',
  'MAIL_CLOUDFLARE_ACCOUNT_ID',
  'MAIL_CLOUDFLARE_API_TOKEN',
  'MAIL_CLOUDFLARE_INGEST_SECRET',
] as const;

export function assertRuntimeSecrets(env: object) {
  assertSnsVerification(env);
  assertWorkerStartup({
    profile: 'production',
    env,
    requiredSecrets: requiredRuntimeSecrets,
  });
}
