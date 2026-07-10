import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { getPermissions } from '@tuturuuu/utils/workspace-helper';

type PermissionsResult = Awaited<ReturnType<typeof getPermissions>>;

export function getFinanceTransactionIdFromStoragePath(path: string) {
  const segments = path.split('/').filter(Boolean);
  if (
    segments[0] !== 'finance' ||
    segments[1] !== 'transactions' ||
    !segments[2]
  ) {
    return null;
  }

  return segments[2];
}

export async function canAccessFinanceTransactionStoragePath({
  access,
  normalizedWsId,
  path,
  permissions,
  supabase,
  userId,
}: {
  access: 'read' | 'write';
  normalizedWsId: string;
  path: string;
  permissions: PermissionsResult;
  supabase: TypedSupabaseClient;
  userId: string;
}) {
  if (!permissions) {
    return false;
  }

  const transactionId = getFinanceTransactionIdFromStoragePath(path);
  if (!transactionId) {
    return false;
  }

  if (access === 'read') {
    const { data, error } = await supabase.rpc(
      'get_wallet_transactions_with_permissions',
      {
        p_ws_id: normalizedWsId,
        p_user_id: userId,
        p_transaction_ids: [transactionId],
        p_limit: 1,
      }
    );

    return !error && (data?.length ?? 0) > 0;
  }

  const sbAdmin = await createAdminClient();
  const { data: transaction } = await sbAdmin
    .from('wallet_transactions')
    .select('creator_id, wallet_id')
    .eq('id', transactionId)
    .maybeSingle();

  if (!transaction?.wallet_id) {
    return false;
  }

  const { data: wallet } = await sbAdmin
    .schema('private')
    .from('workspace_wallets')
    .select('ws_id')
    .eq('id', transaction.wallet_id)
    .maybeSingle();

  const transactionWorkspaceId = wallet?.ws_id;

  if (transactionWorkspaceId !== normalizedWsId) {
    return false;
  }

  if (
    access === 'write' &&
    permissions.containsPermission('update_transactions')
  ) {
    return true;
  }

  if (!permissions.containsPermission('create_transactions')) {
    return false;
  }

  const { data: linkedUser } = await sbAdmin
    .from('workspace_user_linked_users')
    .select('virtual_user_id')
    .eq('platform_user_id', userId)
    .eq('ws_id', normalizedWsId)
    .maybeSingle();

  return (
    !!linkedUser?.virtual_user_id &&
    linkedUser.virtual_user_id === transaction?.creator_id
  );
}
