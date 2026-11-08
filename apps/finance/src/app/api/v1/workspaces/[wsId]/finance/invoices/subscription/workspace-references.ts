import type { FinanceRouteContext } from '@tuturuuu/apis/finance/request-access';
import { NextResponse } from 'next/server';
import { validateInvoiceWallet } from '../invoice-wallet';

export async function validateSubscriptionReferences(
  sbAdmin: FinanceRouteContext['sbAdmin'],
  wsId: string,
  walletId: string,
  groupIds: string[]
): Promise<NextResponse | null> {
  const wallet = await validateInvoiceWallet({ sbAdmin, wsId, walletId });
  if (!wallet.ok)
    return NextResponse.json(
      { message: wallet.message },
      { status: wallet.status }
    );
  const { data, error } = await sbAdmin
    .from('workspace_user_groups')
    .select('id')
    .in('id', groupIds)
    .eq('ws_id', wsId);
  if (error)
    return NextResponse.json(
      { message: 'Failed to validate invoice groups' },
      { status: 500 }
    );
  if (
    new Set((data ?? []).map((group: { id: string }) => group.id)).size !==
    groupIds.length
  ) {
    return NextResponse.json(
      { message: 'Invalid invoice groups' },
      { status: 400 }
    );
  }
  return null;
}
