import { normalizeSummaryWallet } from './helpers';

export type CheckpointWalletContext = {
  normalizedWsId: string;
  permissions: {
    withoutPermission: (permission: 'manage_finance') => boolean;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sbAdmin: any;
  userId: string;
};

export async function listAccessibleCheckpointWallets(
  context: CheckpointWalletContext
) {
  const hasManageFinance =
    !context.permissions.withoutPermission('manage_finance');

  let walletIds: string[] | undefined;

  if (!hasManageFinance) {
    const { data: memberships, error: membershipsError } = await context.sbAdmin
      .from('workspace_role_members')
      .select('role_id, workspace_roles!inner(ws_id)')
      .eq('user_id', context.userId)
      .eq('workspace_roles.ws_id', context.normalizedWsId);

    if (membershipsError) {
      throw membershipsError;
    }

    const roleIds = ((memberships ?? []) as Array<{ role_id: string }>).map(
      (membership) => membership.role_id
    );

    if (roleIds.length === 0) {
      return [];
    }

    const { data: whitelistRows, error: whitelistError } = await context.sbAdmin
      .from('workspace_role_wallet_whitelist')
      .select('wallet_id')
      .in('role_id', roleIds);

    if (whitelistError) {
      throw whitelistError;
    }

    walletIds = [
      ...new Set(
        ((whitelistRows ?? []) as Array<{ wallet_id: string }>).map(
          (row) => row.wallet_id
        )
      ),
    ];

    if (walletIds.length === 0) {
      return [];
    }
  }

  let query = context.sbAdmin
    .schema('private')
    .from('workspace_wallets')
    .select('id,name,currency,balance,type,icon,image_src')
    .eq('ws_id', context.normalizedWsId);

  if (walletIds) {
    query = query.in('id', walletIds);
  }

  const { data, error } = await query.order('name', { ascending: true });

  if (error) {
    throw error;
  }

  return ((data ?? []) as Array<Record<string, unknown>>).map(
    normalizeSummaryWallet
  );
}
