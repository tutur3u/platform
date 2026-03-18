/**
 * Wallet Interest Project API
 *
 * GET: Get interest projections
 */
import { formatDateString, projectInterest } from '@tuturuuu/utils/finance';
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
    select: 'balance',
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

  // Get config
  const { data: config, error: configError } = await access.context.supabase
    .from('wallet_interest_configs')
    .select('id, enabled')
    .eq('wallet_id', walletId)
    .single();

  if (configError || !config) {
    return NextResponse.json(
      { message: 'Interest tracking not enabled for this wallet' },
      { status: 404 }
    );
  }

  if (!config.enabled) {
    return NextResponse.json(
      { message: 'Interest tracking is disabled for this wallet' },
      { status: 400 }
    );
  }

  // Get current rate
  const { data: rates } = await access.context.supabase
    .from('wallet_interest_rates')
    .select('annual_rate')
    .eq('config_id', config.id)
    .is('effective_to', null)
    .order('effective_from', { ascending: false })
    .limit(1);

  const currentRate = rates?.[0]?.annual_rate || 0;

  if (currentRate === 0) {
    return NextResponse.json(
      { message: 'No active interest rate configured' },
      { status: 400 }
    );
  }

  // Get wallet balance
  const balance = (access.wallet.balance as number | null) || 0;

  // Get holidays for projection period
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + days);

  const { data: holidays } = await access.context.supabase
    .from('vietnamese_holidays')
    .select('date')
    .gte('date', startDate)
    .lte('date', formatDateString(endDate));

  const holidayDates = holidays?.map((h: { date: string }) => h.date) || [];

  // Generate projections
  const projections = projectInterest({
    currentBalance: balance,
    currentRate,
    holidays: holidayDates,
    days,
    startDate,
  });

  // Calculate summary
  const totalProjectedInterest = projections.reduce(
    (sum, p) => sum + p.projectedDailyInterest,
    0
  );
  const businessDays = projections.filter((p) => p.isBusinessDay).length;
  const finalBalance =
    projections[projections.length - 1]?.projectedBalance || balance;

  return NextResponse.json({
    startDate,
    days,
    currentBalance: balance,
    currentRate,
    projections,
    summary: {
      totalProjectedInterest,
      businessDays,
      nonBusinessDays: days - businessDays,
      finalBalance,
      percentageGain:
        balance > 0
          ? (((finalBalance - balance) / balance) * 100).toFixed(4)
          : '0',
    },
  });
}
