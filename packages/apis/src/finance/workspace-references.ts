import { NextResponse } from 'next/server';
import type { FinanceRouteContext } from './request-access';

export async function validateFinanceReferences(
  client: FinanceRouteContext['sbAdmin'],
  wsId: string,
  references: { wallet_id?: string | null; category_id?: string | null }
): Promise<NextResponse | null> {
  if (references.wallet_id) {
    const { data, error } = await client
      .schema('private')
      .from('workspace_wallets')
      .select('id')
      .eq('id', references.wallet_id)
      .eq('ws_id', wsId)
      .maybeSingle();
    if (error)
      return NextResponse.json(
        { message: 'Failed to validate wallet' },
        { status: 500 }
      );
    if (!data)
      return NextResponse.json({ message: 'Invalid wallet' }, { status: 400 });
  }
  if (references.category_id) {
    const { data, error } = await client
      .from('transaction_categories')
      .select('id')
      .eq('id', references.category_id)
      .eq('ws_id', wsId)
      .maybeSingle();
    if (error)
      return NextResponse.json(
        { message: 'Failed to validate category' },
        { status: 500 }
      );
    if (!data)
      return NextResponse.json(
        { message: 'Invalid category' },
        { status: 400 }
      );
  }
  return null;
}

const walletNotFound = () =>
  NextResponse.json({ message: 'Wallet not found' }, { status: 404 });
const walletAccessError = () =>
  NextResponse.json(
    { message: 'Error fetching wallet access' },
    { status: 500 }
  );

/**
 * Writers without `manage_finance` may only write to wallets their roles
 * whitelist. The workspace default wallet stays writable without a whitelist
 * entry, matching the default wallet the wallets list shows these writers.
 */
export async function validateFinanceWalletWriteAccess(
  context: FinanceRouteContext,
  walletIds: string[],
  requiredPermission:
    | 'create_transactions'
    | 'update_transactions'
    | 'delete_transactions',
  options: { defaultWalletId?: string | null } = {}
): Promise<NextResponse | null> {
  const { normalizedWsId, permissions, sbAdmin, user } = context;
  if (!permissions.withoutPermission('manage_finance')) return null;
  if (permissions.withoutPermission(requiredPermission))
    return NextResponse.json(
      { message: 'Insufficient permissions' },
      { status: 403 }
    );

  const uniqueWalletIds = [...new Set(walletIds)];
  if (uniqueWalletIds.length === 0) return null;

  const { data: wallets, error: walletsError } = await sbAdmin
    .schema('private')
    .from('workspace_wallets')
    .select('id')
    .eq('ws_id', normalizedWsId)
    .in('id', uniqueWalletIds);
  if (walletsError) return walletAccessError();
  if ((wallets ?? []).length !== uniqueWalletIds.length)
    return walletNotFound();

  const { data: memberships, error: membershipsError } = await sbAdmin
    .from('workspace_role_members')
    .select('role_id, workspace_roles!inner(ws_id)')
    .eq('user_id', user.id)
    .eq('workspace_roles.ws_id', normalizedWsId);
  if (membershipsError) return walletAccessError();
  const roleIds = ((memberships ?? []) as Array<{ role_id: string }>).map(
    (membership) => membership.role_id
  );

  let unlistedWalletIds = uniqueWalletIds;
  if (roleIds.length > 0) {
    const { data: whitelistRows, error: whitelistError } = await sbAdmin
      .from('workspace_role_wallet_whitelist')
      .select('wallet_id')
      .in('wallet_id', uniqueWalletIds)
      .in('role_id', roleIds);
    if (whitelistError) return walletAccessError();
    const whitelisted = new Set(
      ((whitelistRows ?? []) as Array<{ wallet_id: string }>).map(
        (row) => row.wallet_id
      )
    );
    unlistedWalletIds = uniqueWalletIds.filter((id) => !whitelisted.has(id));
  }
  if (unlistedWalletIds.length === 0) return null;
  if (unlistedWalletIds.length > 1) return walletNotFound();

  let defaultWalletId = options.defaultWalletId;
  if (defaultWalletId === undefined) {
    const { data: config, error: configError } = await sbAdmin
      .from('workspace_configs')
      .select('value')
      .eq('ws_id', normalizedWsId)
      .eq('id', 'default_wallet_id')
      .maybeSingle();
    if (configError) return walletAccessError();
    defaultWalletId = config?.value || null;
  }
  return unlistedWalletIds[0] === defaultWalletId ? null : walletNotFound();
}
