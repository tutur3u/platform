/**
 * Interest Transaction Detection API
 *
 * GET: Scan wallet transactions for interest payments
 * POST: Confirm detected transactions as interest (future: category assignment)
 */
import type { InterestDetectionResult } from '@tuturuuu/types';
import { NextResponse } from 'next/server';
import { getAccessibleWallet } from '../../../wallet-access';

interface Params {
  params: Promise<{
    walletId: string;
    wsId: string;
  }>;
}

/**
 * GET: Scan wallet transactions for interest payments
 */
export async function GET(req: Request, { params }: Params) {
  const { walletId, wsId } = await params;
  const access = await getAccessibleWallet({
    req,
    wsId,
    walletId,
    requiredPermission: 'view_transactions',
    select: 'id',
  });

  if (access.response) {
    return access.response;
  }

  const { data, error } = await access.context.sbAdmin
    .schema('private')
    .rpc('detect_wallet_interest_transactions', {
      _actor_id: access.context.userId,
      _wallet_id: walletId,
      _ws_id: access.context.normalizedWsId,
    });

  if (error) {
    console.error('Error detecting wallet interest transactions:', error);
    return NextResponse.json(
      { message: 'Error detecting interest transactions' },
      { status: 500 }
    );
  }

  const result = data as (InterestDetectionResult & { error?: string }) | null;

  if (result?.error === 'wallet_not_found') {
    return NextResponse.json({ message: 'Wallet not found' }, { status: 404 });
  }

  if (!result || result.error) {
    return NextResponse.json(
      { message: 'Error detecting interest transactions' },
      { status: 500 }
    );
  }

  return NextResponse.json(result);
}
