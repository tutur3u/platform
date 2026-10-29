import { NextResponse } from 'next/server';
import type { FinanceRouteContext } from '../request-access';
import { validateFinanceWalletWriteAccess } from '../workspace-references';

export async function loadTransferWallets(
  req: Request,
  context: FinanceRouteContext,
  data: { origin_wallet_id: string; destination_wallet_id: string },
  permission: 'create_transactions' | 'update_transactions',
  previousWalletIds: string[] = []
) {
  const ids = [data.origin_wallet_id, data.destination_wallet_id];
  const response = await validateFinanceWalletWriteAccess(
    req,
    context,
    [...ids, ...previousWalletIds],
    permission
  );
  if (response) return { response };
  const { data: wallets, error } = await context.sbAdmin
    .schema('private')
    .from('workspace_wallets')
    .select('id, currency')
    .eq('ws_id', context.normalizedWsId)
    .in('id', ids);
  const originWallet = wallets?.find(
    (wallet: { id: string; currency: string }) =>
      wallet.id === data.origin_wallet_id
  );
  const destWallet = wallets?.find(
    (wallet: { id: string; currency: string }) =>
      wallet.id === data.destination_wallet_id
  );
  if (
    error ||
    wallets?.length !== 2 ||
    !originWallet?.currency ||
    !destWallet?.currency
  ) {
    return {
      response: NextResponse.json(
        { message: 'Invalid wallets' },
        { status: 400 }
      ),
    };
  }
  return { originWallet, destWallet };
}
