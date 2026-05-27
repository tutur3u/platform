/**
 * Wallet Interest Calculate API
 *
 * GET: Calculate interest for a date range
 */
import { formatDateString } from '@tuturuuu/utils/finance';
import { NextResponse } from 'next/server';
import { getAccessibleWallet } from '../../../wallet-access';

interface Params {
  params: Promise<{
    walletId: string;
    wsId: string;
  }>;
}

/**
 * GET: Calculate interest for a specific date range
 *
 * Query params:
 * - from: Start date (YYYY-MM-DD), defaults to start of current year
 * - to: End date (YYYY-MM-DD), defaults to today
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

  // Parse query params
  const url = new URL(req.url);
  const today = new Date();
  const fromDate =
    url.searchParams.get('from') ||
    formatDateString(new Date(today.getFullYear(), 0, 1));
  const toDate = url.searchParams.get('to') || formatDateString(today);

  // Validate dates
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(fromDate) || !dateRegex.test(toDate)) {
    return NextResponse.json(
      { message: 'Invalid date format. Use YYYY-MM-DD' },
      { status: 400 }
    );
  }

  if (fromDate > toDate) {
    return NextResponse.json(
      { message: 'from date must be before or equal to to date' },
      { status: 400 }
    );
  }

  const { data: calculation, error: calculationError } =
    await access.context.sbAdmin
      .schema('private')
      .rpc('calculate_wallet_interest', {
        _actor_id: access.context.userId,
        _from_date: fromDate,
        _to_date: toDate,
        _wallet_id: walletId,
        _ws_id: access.context.normalizedWsId,
      });

  if (calculationError) {
    console.error('Error calculating wallet interest:', calculationError);
    return NextResponse.json(
      { message: 'Error calculating interest' },
      { status: 500 }
    );
  }

  const payload = calculation as { error?: string } | null;
  if (payload?.error === 'wallet_not_found') {
    return NextResponse.json({ message: 'Wallet not found' }, { status: 404 });
  }

  if (payload?.error === 'not_enabled') {
    return NextResponse.json(
      { message: 'Interest tracking not enabled for this wallet' },
      { status: 404 }
    );
  }

  if (payload?.error === 'disabled') {
    return NextResponse.json(
      { message: 'Interest tracking is disabled for this wallet' },
      { status: 400 }
    );
  }

  if (payload?.error) {
    return NextResponse.json(
      { message: 'Error calculating interest' },
      { status: 500 }
    );
  }

  return NextResponse.json(calculation);
}
