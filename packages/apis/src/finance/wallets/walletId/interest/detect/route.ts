/**
 * Interest Transaction Detection API
 *
 * GET: Scan wallet transactions for interest payments
 * POST: Confirm detected transactions as interest (future: category assignment)
 */

import { createClient } from '@tuturuuu/supabase/next/server';
import type { InterestDetectionResult } from '@tuturuuu/types';
import {
  calculateDailyInterest,
  detectInterestTransactions,
  formatDateString,
  summarizeDetectionResults,
} from '@tuturuuu/utils/finance';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    walletId: string;
    wsId: string;
  }>;
}

/**
 * GET: Scan wallet transactions for interest payments
 */
export async function GET(_: Request, { params }: Params) {
  const supabase = await createClient();
  const { walletId, wsId } = await params;
  const { withoutPermission } = await getPermissions({ wsId });

  if (withoutPermission('view_transactions')) {
    return NextResponse.json(
      { message: 'Insufficient permissions' },
      { status: 403 }
    );
  }

  // Get interest config for this wallet
  const { data: config } = await supabase
    .from('wallet_interest_configs')
    .select('*')
    .eq('wallet_id', walletId)
    .single();

  // Get current rate to estimate expected daily interest
  let expectedDailyInterest: number | undefined;
  if (config) {
    const { data: rate } = await supabase
      .from('wallet_interest_rates')
      .select('annual_rate')
      .eq('config_id', config.id)
      .is('effective_to', null)
      .single();

    if (rate) {
      // Get wallet balance for estimation
      const { data: wallet } = await supabase
        .from('workspace_wallets')
        .select('balance')
        .eq('id', walletId)
        .single();

      if (wallet?.balance) {
        expectedDailyInterest = calculateDailyInterest(
          wallet.balance,
          rate.annual_rate
        );
      }
    }
  }

  // Determine date range for scanning
  // Use tracking_start_date if available, otherwise scan last 90 days
  const today = new Date();
  const startDate = config?.tracking_start_date
    ? new Date(config.tracking_start_date)
    : new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000);

  // Get transactions in date range
  let query = supabase
    .from('wallet_transactions')
    .select('id, created_at, amount, description')
    .eq('wallet_id', walletId)
    .gt('amount', 0) // Only positive amounts (income)
    .gte('created_at', formatDateString(startDate))
    .order('created_at', { ascending: false });

  if (config?.tracking_end_date) {
    query = query.lte('created_at', config.tracking_end_date);
  }

  const { data: transactions, error } = await query;

  if (error) {
    console.error('Error fetching transactions:', error);
    return NextResponse.json(
      { message: 'Error fetching transactions' },
      { status: 500 }
    );
  }

  // Transform transactions for detection
  const txForDetection =
    transactions
      ?.filter((t) => t.id && t.created_at && t.amount !== null)
      .map((t) => ({
        id: t.id as string,
        date: formatDateString(new Date(t.created_at as string)),
        amount: t.amount as number,
        description: t.description as string | null,
      })) || [];

  // Run detection
  const detected = detectInterestTransactions(
    txForDetection,
    expectedDailyInterest
  );
  const summary = summarizeDetectionResults(detected);

  const result: InterestDetectionResult = {
    detected,
    totalAmount: summary.totalAmount,
    summary: {
      highConfidence: summary.highConfidence,
      mediumConfidence: summary.mediumConfidence,
      lowConfidence: summary.lowConfidence,
    },
  };

  return NextResponse.json(result);
}
