/**
 * Wallet Interest Project API
 *
 * GET: Get interest projections
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
 * GET: Project future interest
 *
 * Query params:
 * - days: Number of days to project (default: 30, max: 365)
 * - startDate: Start date for projection (YYYY-MM-DD), defaults to today
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
  const daysStr = url.searchParams.get('days') || '30';
  const startDate =
    url.searchParams.get('startDate') || formatDateString(new Date());

  const days = Math.min(Math.max(1, parseInt(daysStr, 10) || 30), 365);

  // Validate startDate
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(startDate)) {
    return NextResponse.json(
      { message: 'Invalid date format. Use YYYY-MM-DD' },
      { status: 400 }
    );
  }

  const { data, error } = await access.context.sbAdmin
    .schema('private')
    .rpc('get_wallet_interest_projection', {
      _actor_id: access.context.userId,
      _days: days,
      _start_date: startDate,
      _wallet_id: walletId,
      _ws_id: access.context.normalizedWsId,
    });

  if (error || !data) {
    return NextResponse.json(
      { message: 'Error projecting interest' },
      { status: 500 }
    );
  }

  const resultError =
    typeof data === 'object' &&
    !Array.isArray(data) &&
    'error' in data &&
    typeof data.error === 'string'
      ? data.error
      : null;

  if (resultError === 'not_enabled') {
    return NextResponse.json(
      { message: 'Interest tracking not enabled for this wallet' },
      { status: 404 }
    );
  }

  if (resultError === 'disabled') {
    return NextResponse.json(
      { message: 'Interest tracking is disabled for this wallet' },
      { status: 400 }
    );
  }

  if (resultError === 'no_active_rate') {
    return NextResponse.json(
      { message: 'No active interest rate configured' },
      { status: 400 }
    );
  }

  return NextResponse.json(data);
}
