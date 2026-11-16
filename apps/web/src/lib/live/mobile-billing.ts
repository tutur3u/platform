import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { LiveBillingError } from './billing';

// The access workspace has already been authorized by the token route. Billing
// always follows the authenticated actor's own personal pool, not caller input.
export async function resolveMobileLiveBillingWorkspace(userId: string) {
  const admin = await createAdminClient({ noCookie: true });
  const { data, error } = await admin
    .from('workspaces')
    .select('id, workspace_members!inner(user_id, type)')
    .eq('creator_id', userId)
    .eq('personal', true)
    .or('deleted.is.null,deleted.eq.false')
    .eq('workspace_members.user_id', userId)
    .eq('workspace_members.type', 'MEMBER')
    .maybeSingle();

  if (error) {
    throw new LiveBillingError(
      'Unable to resolve personal Live allowance.',
      'LIVE_BILLING_SCOPE_FAILED',
      503
    );
  }
  if (!data?.id) {
    throw new LiveBillingError(
      'Personal Live allowance is unavailable.',
      'INVALID_CREDIT_SOURCE',
      403
    );
  }
  return data.id;
}
