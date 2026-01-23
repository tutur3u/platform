import { createClient } from '@tuturuuu/supabase/next/server';
import type { InvoiceTotalsByGroup } from '@tuturuuu/types/primitives/Invoice';
import {
  getPermissions,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import dayjs from 'dayjs';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

type WeekStartsOn = 0 | 1 | 6;

export async function GET(req: Request, { params }: Params) {
  const { wsId: id } = await params;
  const wsId = await normalizeWorkspaceId(id);

  // Check permissions
  const { withoutPermission } = await getPermissions({ wsId });
  if (withoutPermission('view_invoices')) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 403 });
  }

  // Parse query parameters
  const { searchParams } = new URL(req.url);
  const walletIds = searchParams.getAll('walletIds').filter(Boolean);
  const userIds = searchParams.getAll('userIds').filter(Boolean);
  const start = searchParams.get('start');
  const end = searchParams.get('end');
  const weekStartsOn = (Number(searchParams.get('weekStartsOn')) ||
    1) as WeekStartsOn;

  try {
    const hasDateRange = !!(start && end);

    if (hasDateRange) {
      // Fetch data grouped by wallet and by creator for the date range
      const [walletData, creatorData] = await Promise.all([
        getInvoiceTotalsByDateRange(wsId, {
          walletIds: walletIds.length > 0 ? walletIds : undefined,
          userIds: userIds.length > 0 ? userIds : undefined,
          startDate: start!,
          endDate: end!,
          groupByCreator: false,
          weekStartsOn,
        }),
        getInvoiceTotalsByDateRange(wsId, {
          walletIds: walletIds.length > 0 ? walletIds : undefined,
          userIds: userIds.length > 0 ? userIds : undefined,
          startDate: start!,
          endDate: end!,
          groupByCreator: true,
          weekStartsOn,
        }),
      ]);

      return NextResponse.json({
        walletData,
        creatorData,
        hasDateRange: true,
        startDate: start,
        endDate: end,
      });
    }

    // No date range: fetch all periods for both wallet and creator grouping
    const [
      dailyWalletData,
      weeklyWalletData,
      monthlyWalletData,
      dailyCreatorData,
      weeklyCreatorData,
      monthlyCreatorData,
    ] = await Promise.all([
      getDailyInvoiceTotals(
        wsId,
        walletIds.length > 0 ? walletIds : undefined,
        userIds.length > 0 ? userIds : undefined
      ),
      getWeeklyInvoiceTotals(
        wsId,
        walletIds.length > 0 ? walletIds : undefined,
        userIds.length > 0 ? userIds : undefined,
        weekStartsOn
      ),
      getMonthlyInvoiceTotals(
        wsId,
        walletIds.length > 0 ? walletIds : undefined,
        userIds.length > 0 ? userIds : undefined
      ),
      getDailyInvoiceTotalsByCreator(
        wsId,
        walletIds.length > 0 ? walletIds : undefined,
        userIds.length > 0 ? userIds : undefined,
        weekStartsOn
      ),
      getWeeklyInvoiceTotalsByCreator(
        wsId,
        walletIds.length > 0 ? walletIds : undefined,
        userIds.length > 0 ? userIds : undefined,
        weekStartsOn
      ),
      getMonthlyInvoiceTotalsByCreator(
        wsId,
        walletIds.length > 0 ? walletIds : undefined,
        userIds.length > 0 ? userIds : undefined
      ),
    ]);

    return NextResponse.json({
      dailyWalletData,
      weeklyWalletData,
      monthlyWalletData,
      dailyCreatorData,
      weeklyCreatorData,
      monthlyCreatorData,
      hasDateRange: false,
    });
  } catch (error) {
    console.error('Error fetching invoice analytics:', error);
    return NextResponse.json(
      { message: 'Error fetching invoice analytics' },
      { status: 500 }
    );
  }
}

// ============================================================================
// Data fetching functions
// ============================================================================

interface DateRangeParams {
  walletIds?: string[];
  userIds?: string[];
  startDate: string;
  endDate: string;
  groupByCreator: boolean;
  weekStartsOn?: WeekStartsOn;
}

async function getInvoiceTotalsByDateRange(
  wsId: string,
  params: DateRangeParams
): Promise<InvoiceTotalsByGroup[]> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc(
    'get_invoice_totals_by_date_range' as 'get_daily_income_expense',
    {
      _ws_id: wsId,
      start_date: params.startDate,
      end_date: params.endDate,
      wallet_ids: params.walletIds?.length ? params.walletIds : null,
      user_ids: params.userIds?.length ? params.userIds : null,
      group_by_creator: params.groupByCreator,
      week_start_day: params.weekStartsOn ?? 1,
    } as any
  );

  if (error) {
    console.error('Error fetching invoice totals by date range:', error);
    return [];
  }

  return (data || []).map((item: any) => ({
    period: item.period,
    group_id: item.group_id,
    group_name: item.group_name || 'Unknown',
    group_avatar_url: item.group_avatar_url,
    total_amount: Number(item.total_amount) || 0,
    invoice_count: Number(item.invoice_count) || 0,
  }));
}

async function getDailyInvoiceTotals(
  wsId: string,
  walletIds?: string[],
  userIds?: string[]
): Promise<InvoiceTotalsByGroup[]> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc(
    'get_daily_invoice_totals' as 'get_daily_income_expense',
    {
      _ws_id: wsId,
      past_days: 14,
      wallet_ids: walletIds?.length ? walletIds : null,
      user_ids: userIds?.length ? userIds : null,
    } as any
  );

  if (error) {
    console.error('Error fetching daily invoice totals:', error);
    return [];
  }

  return (data || []).map((item: any) => ({
    period: item.period,
    group_id: item.wallet_id,
    group_name: item.wallet_name || 'Unknown',
    group_avatar_url: null,
    total_amount: Number(item.total_amount) || 0,
    invoice_count: Number(item.invoice_count) || 0,
  }));
}

async function getWeeklyInvoiceTotals(
  wsId: string,
  walletIds?: string[],
  userIds?: string[],
  weekStartsOn: WeekStartsOn = 1
): Promise<InvoiceTotalsByGroup[]> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc(
    'get_weekly_invoice_totals' as 'get_daily_income_expense',
    {
      _ws_id: wsId,
      past_weeks: 12,
      wallet_ids: walletIds?.length ? walletIds : null,
      user_ids: userIds?.length ? userIds : null,
      week_start_day: weekStartsOn,
    } as any
  );

  if (error) {
    console.error('Error fetching weekly invoice totals:', error);
    return [];
  }

  return (data || []).map((item: any) => ({
    period: item.period,
    group_id: item.wallet_id,
    group_name: item.wallet_name || 'Unknown',
    group_avatar_url: null,
    total_amount: Number(item.total_amount) || 0,
    invoice_count: Number(item.invoice_count) || 0,
  }));
}

async function getMonthlyInvoiceTotals(
  wsId: string,
  walletIds?: string[],
  userIds?: string[]
): Promise<InvoiceTotalsByGroup[]> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc(
    'get_monthly_invoice_totals' as 'get_daily_income_expense',
    {
      _ws_id: wsId,
      past_months: 12,
      wallet_ids: walletIds?.length ? walletIds : null,
      user_ids: userIds?.length ? userIds : null,
    } as any
  );

  if (error) {
    console.error('Error fetching monthly invoice totals:', error);
    return [];
  }

  return (data || []).map((item: any) => ({
    period: item.period,
    group_id: item.wallet_id,
    group_name: item.wallet_name || 'Unknown',
    group_avatar_url: null,
    total_amount: Number(item.total_amount) || 0,
    invoice_count: Number(item.invoice_count) || 0,
  }));
}

// ============================================================================
// Creator-grouped versions
// ============================================================================

/**
 * Helper to calculate start of week based on weekStartsOn preference
 * weekStartsOn: 0=Sunday, 1=Monday, 6=Saturday
 */
function getStartOfWeek(
  date: dayjs.Dayjs,
  weekStartsOn: WeekStartsOn
): dayjs.Dayjs {
  const dow = date.day(); // 0=Sunday, 1=Monday, ..., 6=Saturday
  const daysToSubtract = (dow - weekStartsOn + 7) % 7;
  return date.subtract(daysToSubtract, 'day').startOf('day');
}

async function getDailyInvoiceTotalsByCreator(
  wsId: string,
  walletIds?: string[],
  userIds?: string[],
  weekStartsOn: WeekStartsOn = 1
): Promise<InvoiceTotalsByGroup[]> {
  const supabase = await createClient();

  // Match SQL: CURRENT_DATE - INTERVAL '13 days' to CURRENT_DATE (14 days total)
  const endDate = dayjs();
  const startDate = endDate.subtract(13, 'day');

  const { data, error } = await supabase.rpc(
    'get_invoice_totals_by_date_range' as 'get_daily_income_expense',
    {
      _ws_id: wsId,
      start_date: startDate.format('YYYY-MM-DD'),
      end_date: endDate.format('YYYY-MM-DD'),
      wallet_ids: walletIds?.length ? walletIds : null,
      user_ids: userIds?.length ? userIds : null,
      group_by_creator: true,
      week_start_day: weekStartsOn,
    } as any
  );

  if (error) {
    console.error('Error fetching daily invoice totals by creator:', error);
    return [];
  }

  return (data || []).map((item: any) => ({
    period: item.period,
    group_id: item.group_id,
    group_name: item.group_name || 'Unknown',
    group_avatar_url: item.group_avatar_url,
    total_amount: Number(item.total_amount) || 0,
    invoice_count: Number(item.invoice_count) || 0,
  }));
}

async function getWeeklyInvoiceTotalsByCreator(
  wsId: string,
  walletIds?: string[],
  userIds?: string[],
  weekStartsOn: WeekStartsOn = 1
): Promise<InvoiceTotalsByGroup[]> {
  const supabase = await createClient();

  // Calculate week-aligned start date based on user's preference
  const endDate = dayjs();
  const startOfCurrentWeek = getStartOfWeek(endDate, weekStartsOn);
  const startDate = startOfCurrentWeek.subtract(11, 'week');

  const { data, error } = await supabase.rpc(
    'get_invoice_totals_by_date_range' as 'get_daily_income_expense',
    {
      _ws_id: wsId,
      start_date: startDate.format('YYYY-MM-DD'),
      end_date: endDate.format('YYYY-MM-DD'),
      wallet_ids: walletIds?.length ? walletIds : null,
      user_ids: userIds?.length ? userIds : null,
      group_by_creator: true,
      week_start_day: weekStartsOn,
    } as any
  );

  if (error) {
    console.error('Error fetching weekly invoice totals by creator:', error);
    return [];
  }

  return (data || []).map((item: any) => ({
    period: item.period,
    group_id: item.group_id,
    group_name: item.group_name || 'Unknown',
    group_avatar_url: item.group_avatar_url,
    total_amount: Number(item.total_amount) || 0,
    invoice_count: Number(item.invoice_count) || 0,
  }));
}

async function getMonthlyInvoiceTotalsByCreator(
  wsId: string,
  walletIds?: string[],
  userIds?: string[]
): Promise<InvoiceTotalsByGroup[]> {
  const supabase = await createClient();

  // Match SQL: date_trunc('month', CURRENT_DATE) - INTERVAL '1 month' * 11 to CURRENT_DATE
  const endDate = dayjs();
  const startDate = endDate.startOf('month').subtract(11, 'month');

  const { data, error } = await supabase.rpc(
    'get_invoice_totals_by_date_range' as 'get_daily_income_expense',
    {
      _ws_id: wsId,
      start_date: startDate.format('YYYY-MM-DD'),
      end_date: endDate.format('YYYY-MM-DD'),
      wallet_ids: walletIds?.length ? walletIds : null,
      user_ids: userIds?.length ? userIds : null,
      group_by_creator: true,
    } as any
  );

  if (error) {
    console.error('Error fetching monthly invoice totals by creator:', error);
    return [];
  }

  return (data || []).map((item: any) => ({
    period: item.period,
    group_id: item.group_id,
    group_name: item.group_name || 'Unknown',
    group_avatar_url: item.group_avatar_url,
    total_amount: Number(item.total_amount) || 0,
    invoice_count: Number(item.invoice_count) || 0,
  }));
}
