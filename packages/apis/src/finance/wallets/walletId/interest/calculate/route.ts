/**
 * Wallet Interest Calculate API
 *
 * GET: Calculate interest for a date range
 */
import type { WalletInterestRate } from '@tuturuuu/types';
import { calculateInterest, formatDateString } from '@tuturuuu/utils/finance';
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
    select: 'balance',
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

  // Get rates
  const { data: rates, error: ratesError } = await access.context.supabase
    .from('wallet_interest_rates')
    .select('*')
    .eq('config_id', config.id)
    .order('effective_from', { ascending: false });

  if (ratesError) {
    return NextResponse.json(
      { message: 'Error fetching interest rates' },
      { status: 500 }
    );
  }

  // Get holidays
  const { data: holidays } = await access.context.supabase
    .from('vietnamese_holidays')
    .select('date')
    .gte('date', fromDate)
    .lte('date', toDate);

  const holidayDates = holidays?.map((h: { date: string }) => h.date) || [];

  // Get transactions for the period
  const { data: transactions } = await access.context.supabase
    .from('wallet_transactions')
    .select('created_at, amount')
    .eq('wallet_id', walletId)
    .gte('created_at', fromDate)
    .lte('created_at', `${toDate}T23:59:59`)
    .order('created_at', { ascending: true });

  const txList =
    transactions
      ?.filter(
        (t: { amount: number | null; created_at: string | null }) =>
          t.amount !== null && t.created_at !== null
      )
      .map((t: { created_at: string | null; amount: number | null }) => ({
        date: formatDateString(new Date(t.created_at as string)),
        amount: t.amount as number,
      })) || [];

  // Get initial balance (balance at start of period)
  // This is calculated by subtracting all transactions from current balance
  const currentBalance = (access.wallet.balance as number | null) || 0;

  // Get all transactions after fromDate to calculate initial balance
  const { data: allTransactions } = await access.context.supabase
    .from('wallet_transactions')
    .select('amount')
    .eq('wallet_id', walletId)
    .gte('created_at', fromDate);

  const sumOfTransactions =
    allTransactions?.reduce(
      (sum: number, t: { amount: number | null }) => sum + (t.amount ?? 0),
      0
    ) || 0;
  const initialBalance = currentBalance - sumOfTransactions;

  // Calculate interest
  const result = calculateInterest({
    transactions: txList,
    rates: rates as WalletInterestRate[],
    holidays: holidayDates,
    fromDate,
    toDate,
    initialBalance: Math.max(0, initialBalance),
  });

  return NextResponse.json({
    fromDate,
    toDate,
    initialBalance: Math.max(0, initialBalance),
    ...result,
  });
}
