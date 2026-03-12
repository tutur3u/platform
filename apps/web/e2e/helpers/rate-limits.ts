import { createAdminClient } from '@tuturuuu/supabase/next/server';

export async function resetDbRateLimits(): Promise<void> {
  const admin = await createAdminClient();
  const { error } = await admin.rpc('admin_reset_rate_limits');

  if (error) {
    throw new Error(`Failed to reset DB rate limits: ${error.message}`);
  }
}
