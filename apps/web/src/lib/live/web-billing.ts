import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { LiveBillingError } from './billing';

/**
 * Web Live bills the actor's personal workspace or the access workspace,
 * as selected by the dashboard credit source. Caller input can only narrow
 * that choice, never name another workspace.
 */
export async function resolveBillingWorkspace({
  accessWsId,
  creditSource,
  creditWsId,
  userId,
}: {
  accessWsId: string;
  creditSource: 'personal' | 'workspace';
  creditWsId?: string;
  userId: string;
}) {
  const sbAdmin = await createAdminClient({ noCookie: true });
  if (creditSource === 'personal') {
    const { data, error } = await sbAdmin
      .from('workspaces')
      .select('id, workspace_members!inner(user_id)')
      .eq('creator_id', userId)
      .eq('personal', true)
      .eq('workspace_members.user_id', userId)
      .eq('workspace_members.type', 'MEMBER')
      .maybeSingle();
    if (error) throw new Error('Failed to resolve personal workspace');
    if (!data?.id || (creditWsId && creditWsId !== data.id)) {
      throw new LiveBillingError(
        'Invalid personal credit source.',
        'INVALID_CREDIT_SOURCE',
        403
      );
    }
    return data.id;
  }

  if (creditWsId && creditWsId !== accessWsId) {
    throw new LiveBillingError(
      'Invalid workspace credit source.',
      'INVALID_CREDIT_SOURCE',
      403
    );
  }
  return accessWsId;
}
