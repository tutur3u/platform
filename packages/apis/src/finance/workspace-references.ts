import { NextResponse } from 'next/server';
import type { FinanceRouteContext } from './request-access';
import { getAccessibleWallet } from './wallets/wallet-access';

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

export async function validateFinanceWalletWriteAccess(
  req: Request,
  context: FinanceRouteContext,
  walletIds: string[],
  requiredPermission: 'create_transactions' | 'update_transactions'
): Promise<NextResponse | null> {
  if (!context.permissions.withoutPermission('manage_finance')) return null;
  for (const walletId of new Set(walletIds)) {
    const access = await getAccessibleWallet({
      req,
      wsId: context.normalizedWsId,
      walletId,
      requiredPermission,
      select: 'id',
      authContext: context,
    });
    if (access.response) return access.response;
  }
  return null;
}
