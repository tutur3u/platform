import { createAdminClient } from '@tuturuuu/supabase/next/server';
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
  userId,
}: {
  access: 'read' | 'write';
  normalizedWsId: string;
  path: string;
  permissions: PermissionsResult;
  userId: string;
}) {
  if (!permissions) {
    return false;
  }

  const transactionId = getFinanceTransactionIdFromStoragePath(path);
  if (!transactionId) {
    return false;
  }

  const sbAdmin = await createAdminClient();
  const { data: transaction } = await sbAdmin
    .from('wallet_transactions')
    .select('creator_id, workspace_wallets!wallet_id(ws_id)')
    .eq('id', transactionId)
    .maybeSingle();

  const transactionWorkspaceId = (
    transaction?.workspace_wallets as { ws_id?: string } | null | undefined
  )?.ws_id;

  if (transactionWorkspaceId !== normalizedWsId) {
    return false;
  }

  if (
    access === 'read' &&
    (permissions.containsPermission('view_transactions') ||
      permissions.containsPermission('update_transactions'))
  ) {
    return true;
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
