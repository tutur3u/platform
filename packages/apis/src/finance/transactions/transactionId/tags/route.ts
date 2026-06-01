import { NextResponse } from 'next/server';
import {
  type FinanceRouteAuthContext,
  getFinanceRouteContext,
} from '../../../request-access';

interface Params {
  params: Promise<{
    transactionId: string;
    wsId: string;
  }>;
}

export async function GET(
  req: Request,
  { params }: Params,
  authContext?: FinanceRouteAuthContext
) {
  const { transactionId, wsId } = await params;
  const access = await getFinanceRouteContext(req, wsId, authContext);

  if (access.response) {
    return access.response;
  }

  const { normalizedWsId, permissions, sbAdmin } = access.context;
  const { withoutPermission } = permissions;

  if (withoutPermission('view_transactions')) {
    return NextResponse.json(
      { message: 'Insufficient permissions' },
      { status: 403 }
    );
  }

  const { data: transaction, error: transactionError } = await sbAdmin
    .from('wallet_transactions')
    .select('id, wallet_id')
    .eq('id', transactionId)
    .maybeSingle();

  if (transactionError || !transaction) {
    return NextResponse.json(
      { message: 'Transaction not found' },
      { status: 404 }
    );
  }

  const { data: wallet, error: walletError } = await sbAdmin
    .schema('private')
    .from('workspace_wallets')
    .select('id')
    .eq('id', transaction.wallet_id)
    .eq('ws_id', normalizedWsId)
    .maybeSingle();

  if (walletError || !wallet) {
    return NextResponse.json(
      { message: 'Transaction not found' },
      { status: 404 }
    );
  }

  const { data, error } = await sbAdmin
    .from('wallet_transaction_tags')
    .select('tag_id')
    .eq('transaction_id', transactionId);

  if (error) {
    return NextResponse.json(
      { message: 'Error fetching transaction tags' },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
}
