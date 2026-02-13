/**
 * Wallet Interest API - Main endpoint
 *
 * GET: Get interest summary with projections
 * POST: Enable interest tracking (create config)
 */

import { createClient } from '@tuturuuu/supabase/next/server';
import type {
  CreateInterestConfigInput,
  InterestSummary,
  WalletInterestConfig,
  WalletInterestRate,
} from '@tuturuuu/types';
import {
  calculateInterest,
  estimateMonthlyInterest,
  estimateYearlyInterest,
  findPendingDeposits,
  formatDateString,
  getMonthToDateRange,
  getYearToDateRange,
  holidaysToSet,
  projectInterest,
} from '@tuturuuu/utils/finance';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';

interface Params {
  params: Promise<{
    walletId: string;
    wsId: string;
  }>;
}

const createConfigSchema = z.object({
  provider: z.enum(['momo', 'zalopay']),
  zalopay_tier: z.enum(['standard', 'gold', 'diamond']).nullable().optional(),
  initial_rate: z.number().min(0).max(100).optional(),
  tracking_start_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
});

/**
 * GET: Get interest summary with calculations and projections
 */
export async function GET(_: Request, { params }: Params) {
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

  // Check if interest tracking is enabled for this wallet
  const { data: config, error: configError } = await supabase
    .from('wallet_interest_configs')
    .select('*')
    .eq('wallet_id', walletId)
    .single();

  if (configError || !config) {
    // No config means interest tracking is not enabled
    return NextResponse.json(
      {
        enabled: false,
        message: 'Interest tracking not enabled for this wallet',
      },
      { status: 200 }
    );
  }

  if (!config.enabled) {
    return NextResponse.json(
      { enabled: false, config, message: 'Interest tracking is disabled' },
      { status: 200 }
    );
  }

  // Get rate history
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

  // Get current rate (most recent with no effective_to)
  const currentRate = rates?.find((r) => !r.effective_to) || null;

  // Get holidays for calculation
  const today = new Date();
  const yearStart = new Date(today.getFullYear(), 0, 1);
  const { data: holidays } = await supabase
    .from('vietnamese_holidays')
    .select('date')
    .gte('date', formatDateString(yearStart))
    .lte('date', formatDateString(new Date(today.getFullYear() + 1, 11, 31)));

  const holidayDates = holidays?.map((h) => h.date) || [];

  // Get wallet balance
  const { data: wallet } = await supabase
    .from('workspace_wallets')
    .select('balance')
    .eq('id', walletId)
    .single();

  const balance = wallet?.balance || 0;

  // Determine the effective start date for tracking
  // Use tracking_start_date if set, otherwise use yearStart
  // Note: tracking_start_date is already in YYYY-MM-DD format from the database
  const trackingStartStr =
    config.tracking_start_date || formatDateString(yearStart);
  const yearStartStr = formatDateString(yearStart);
  // Use string comparison to avoid timezone issues
  const effectiveStartStr =
    trackingStartStr > yearStartStr ? trackingStartStr : yearStartStr;

  // Get transactions for the tracking period
  let transactionQuery = supabase
    .from('wallet_transactions')
    .select('created_at, amount')
    .eq('wallet_id', walletId)
    .gte('created_at', effectiveStartStr)
    .order('created_at', { ascending: true });

  // Apply end date filter if set
  if (config.tracking_end_date) {
    transactionQuery = transactionQuery.lte(
      'created_at',
      config.tracking_end_date
    );
  }

  const { data: transactions } = await transactionQuery;

  const txList =
    transactions
      ?.filter((t) => t.amount !== null && t.created_at !== null)
      .map((t) => ({
        date: formatDateString(new Date(t.created_at as string)),
        amount: t.amount as number,
      })) || [];

  // Calculate YTD interest
  const ytdRange = getYearToDateRange(today);
  const ytdResult = calculateInterest({
    transactions: txList,
    rates: rates as WalletInterestRate[],
    holidays: holidayDates,
    fromDate: ytdRange.fromDate,
    toDate: ytdRange.toDate,
  });

  // Calculate MTD interest
  const mtdRange = getMonthToDateRange(today);
  const mtdResult = calculateInterest({
    transactions: txList.filter((t) => t.date >= mtdRange.fromDate),
    rates: rates as WalletInterestRate[],
    holidays: holidayDates,
    fromDate: mtdRange.fromDate,
    toDate: mtdRange.toDate,
  });

  // Calculate today's interest
  const todayStr = formatDateString(today);
  const todayResult = calculateInterest({
    transactions: txList.filter((t) => t.date === todayStr),
    rates: rates as WalletInterestRate[],
    holidays: holidayDates,
    fromDate: todayStr,
    toDate: todayStr,
    initialBalance: balance,
  });

  // Find pending deposits
  // Only consider deposits within 7 days AND after tracking_start_date
  // (trackingStartStr is already defined above from the config)

  // Calculate date 7 days ago for filtering
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const sevenDaysAgoStr = formatDateString(sevenDaysAgo);

  const recentTransactions = txList.filter((t) => {
    // Must be within 7 days (using string comparison for consistency)
    if (t.date < sevenDaysAgoStr) return false;
    // Must not be in the future
    if (t.date > todayStr) return false;
    // Must be on or after tracking start date if set
    if (trackingStartStr && t.date < trackingStartStr) return false;
    return true;
  });
  const pendingDeposits = findPendingDeposits(
    recentTransactions,
    holidaysToSet(holidayDates),
    today
  );

  // Generate projections
  const annualRate = currentRate?.annual_rate || 0;
  const weekProjections = projectInterest({
    currentBalance: balance,
    currentRate: annualRate,
    holidays: holidayDates,
    days: 7,
    startDate: todayStr,
  });

  const monthProjections = projectInterest({
    currentBalance: balance,
    currentRate: annualRate,
    holidays: holidayDates,
    days: 30,
    startDate: todayStr,
  });

  const quarterProjections = projectInterest({
    currentBalance: balance,
    currentRate: annualRate,
    holidays: holidayDates,
    days: 90,
    startDate: todayStr,
  });

  const yearProjections = projectInterest({
    currentBalance: balance,
    currentRate: annualRate,
    holidays: holidayDates,
    days: 365,
    startDate: todayStr,
  });

  const summary: InterestSummary = {
    config: config as WalletInterestConfig,
    currentRate: currentRate as WalletInterestRate | null,
    rateHistory: rates as WalletInterestRate[],
    todayInterest: todayResult.totalInterest,
    monthToDateInterest: mtdResult.totalInterest,
    yearToDateInterest: ytdResult.totalInterest,
    totalEarnedInterest: config.total_interest_earned ?? 0,
    pendingDeposits,
    projections: {
      week: weekProjections,
      month: monthProjections,
      quarter: quarterProjections,
      year: yearProjections,
    },
    averageDailyInterest:
      ytdResult.businessDaysCount > 0
        ? Math.floor(ytdResult.totalInterest / ytdResult.businessDaysCount)
        : 0,
    estimatedMonthlyInterest: estimateMonthlyInterest(balance, annualRate),
    estimatedYearlyInterest: estimateYearlyInterest(balance, annualRate),
  };

  return NextResponse.json(summary);
}

/**
 * POST: Enable interest tracking for a wallet
 */
export async function POST(req: Request, { params }: Params) {
  const supabase = await createClient();
  const { walletId, wsId } = await params;
  const permissions = await getPermissions({ wsId });

  if (!permissions) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const { withoutPermission } = permissions;

  if (withoutPermission('update_wallets')) {
    return NextResponse.json(
      { message: 'Insufficient permissions' },
      { status: 403 }
    );
  }

  // Validate input
  const body = await req.json();
  const parseResult = createConfigSchema.safeParse(body);

  if (!parseResult.success) {
    return NextResponse.json(
      { message: 'Invalid input', errors: parseResult.error.flatten() },
      { status: 400 }
    );
  }

  const input: CreateInterestConfigInput = {
    wallet_id: walletId,
    ...parseResult.data,
  };

  // Verify wallet exists and belongs to workspace
  const { data: wallet, error: walletError } = await supabase
    .from('workspace_wallets')
    .select('id, ws_id')
    .eq('id', walletId)
    .eq('ws_id', wsId)
    .single();

  if (walletError || !wallet) {
    return NextResponse.json({ message: 'Wallet not found' }, { status: 404 });
  }

  // Check if config already exists
  const { data: existingConfig } = await supabase
    .from('wallet_interest_configs')
    .select('id')
    .eq('wallet_id', walletId)
    .single();

  if (existingConfig) {
    return NextResponse.json(
      { message: 'Interest tracking already enabled for this wallet' },
      { status: 409 }
    );
  }

  // Determine tracking start date - default to today if not provided
  const trackingStartDate =
    input.tracking_start_date ?? formatDateString(new Date());

  // Create config
  const { data: config, error: configError } = await supabase
    .from('wallet_interest_configs')
    .insert({
      wallet_id: walletId,
      provider: input.provider,
      zalopay_tier:
        input.provider === 'zalopay'
          ? (input.zalopay_tier ?? 'standard')
          : null,
      enabled: true,
      tracking_start_date: trackingStartDate,
    })
    .select()
    .single();

  if (configError || !config) {
    console.error('Error creating interest config:', configError);
    return NextResponse.json(
      { message: 'Error creating interest config' },
      { status: 500 }
    );
  }

  // Determine initial rate
  const { getDefaultRate } = await import('@tuturuuu/types');
  const initialRate =
    input.initial_rate ?? getDefaultRate(input.provider, input.zalopay_tier);

  // Create initial rate entry
  const { error: rateError } = await supabase
    .from('wallet_interest_rates')
    .insert({
      config_id: config.id,
      annual_rate: initialRate,
      effective_from: formatDateString(new Date()),
    });

  if (rateError) {
    console.error('Error creating initial rate:', rateError);
    // Config was created but rate failed - still return success with warning
    return NextResponse.json({
      config,
      warning: 'Config created but initial rate could not be set',
    });
  }

  return NextResponse.json(config, { status: 201 });
}
