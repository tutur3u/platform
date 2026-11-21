import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { Json } from '@tuturuuu/types/db';
import { InternalAccountAdminError } from './errors';

/** Database CAS, not the lease check, fences delayed metadata writes. */
export async function transitionAccountMfaPolicy(
  admin: TypedSupabaseClient,
  userId: string,
  expected: unknown,
  next: unknown,
  clearDevices = false
) {
  const { data, error } = await admin.rpc('transition_account_mfa_policy', {
    p_user_id: userId,
    p_expected: (expected ?? null) as Json,
    p_next: (next ?? null) as Json,
    p_clear_devices: clearDevices,
  });
  if (error)
    throw new InternalAccountAdminError(
      'Account security changed. Try again.',
      error.code === '40001' ? 409 : 503
    );
  return data;
}
