/**
 * Wallet Interest Calculate API
 *
 * GET: Calculate interest for a date range
 */

import { createClient } from '@tuturuuu/supabase/next/server';
import type { WalletInterestRate } from '@tuturuuu/types';
import { calculateInterest, formatDateString } from '@tuturuuu/utils/finance';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';

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
  const supabase = await createClient();
  const { walletId, wsId } = await params;
  const permissions = await getPermissions({ wsId });

  if (!permissions) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const { withoutPermission } = permissions;

  if (withoutPermission('view_transactions')) {
    return NextResponse.json(
      { message: 'Insufficient permissions' },
      { status: 403 }
    );
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
  const { data: config, error: configError } = await supabase
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
  const { data: rates, error: ratesError } = await supabase
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
  const { data: holidays } = await supabase
    .from('vietnamese_holidays')
    .select('date')
    .gte('date', fromDate)
    .lte('date', toDate);

  const holidayDates = holidays?.map((h) => h.date) || [];

  // Get transactions for the period
  const { data: transactions } = await supabase
    .from('wallet_transactions')
    .select('created_at, amount')
    .eq('wallet_id', walletId)
    .gte('created_at', fromDate)
    .lte('created_at', `${toDate}T23:59:59`)
    .order('created_at', { ascending: true });

  const txList =
    transactions
      ?.filter((t) => t.amount !== null && t.created_at !== null)
      .map((t) => ({
        date: formatDateString(new Date(t.created_at as string)),
        amount: t.amount as number,
      })) || [];

  // Get initial balance (balance at start of period)
  // This is calculated by subtracting all transactions from current balance
  const { data: wallet } = await supabase
    .from('workspace_wallets')
    .select('balance')
    .eq('id', walletId)
    .single();

  const currentBalance = wallet?.balance || 0;

  // Get all transactions after fromDate to calculate initial balance
  const { data: allTransactions } = await supabase
    .from('wallet_transactions')
    .select('amount')
    .eq('wallet_id', walletId)
    .gte('created_at', fromDate);

  const sumOfTransactions =
    allTransactions?.reduce((sum, t) => sum + (t.amount ?? 0), 0) || 0;
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
