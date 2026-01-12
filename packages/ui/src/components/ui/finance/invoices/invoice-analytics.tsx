import { createClient } from '@tuturuuu/supabase/next/server';
import dayjs from 'dayjs';
import type { InvoiceTotalsChartProps } from './charts/invoice-totals-chart';
import { InvoiceTotalsChart } from './charts/invoice-totals-chart';

/**
 * weekStartsOn values (JavaScript convention, matching useCalendarPreferences):
 *   0 = Sunday
 *   1 = Monday (default)
 *   6 = Saturday
 */
type WeekStartsOn = 0 | 1 | 6;

// Local type definition until types package is picked up
interface InvoiceTotalsByGroup {
  period: string;
  group_id: string;
  group_name: string;
  group_avatar_url?: string | null;
  total_amount: number;
  invoice_count: number;
}

interface InvoiceAnalyticsFilters {
  walletIds?: string[];
  userIds?: string[];
  startDate?: string;
  endDate?: string;
}

interface InvoiceAnalyticsProps {
  wsId: string;
  filters?: InvoiceAnalyticsFilters;
  className?: string;
  /**
   * First day of week preference (0=Sunday, 1=Monday, 6=Saturday)
   * Used for weekly grouping calculations
   * @default 1 (Monday)
   */
  weekStartsOn?: WeekStartsOn;
}

export async function InvoiceAnalytics({
  wsId,
  filters,
  className,
  weekStartsOn = 1,
}: InvoiceAnalyticsProps) {
  const { walletIds, userIds, startDate, endDate } = filters || {};

  // If we have a date range, use the unified function that auto-determines granularity
  // Otherwise, fetch all three periods for the toggleable view
  const hasDateRange = !!(startDate && endDate);

  if (hasDateRange) {
    // Fetch data grouped by wallet and by creator for the date range
    const [walletData, creatorData] = await Promise.all([
      getInvoiceTotalsByDateRange(wsId, {
        walletIds,
        userIds,
        startDate: startDate!,
        endDate: endDate!,
        groupByCreator: false,
        weekStartsOn,
      }),
      getInvoiceTotalsByDateRange(wsId, {
        walletIds,
        userIds,
        startDate: startDate!,
        endDate: endDate!,
        groupByCreator: true,
        weekStartsOn,
      }),
    ]);

    const chartProps: InvoiceTotalsChartProps = {
      walletData,
      creatorData,
      hasDateRange: true,
      startDate: startDate!,
      endDate: endDate!,
      className,
    };

    return <InvoiceTotalsChart {...chartProps} />;
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
    getDailyInvoiceTotals(wsId, walletIds, userIds),
    getWeeklyInvoiceTotals(wsId, walletIds, userIds, weekStartsOn),
    getMonthlyInvoiceTotals(wsId, walletIds, userIds),
    getDailyInvoiceTotalsByCreator(wsId, walletIds, userIds, weekStartsOn),
    getWeeklyInvoiceTotalsByCreator(wsId, walletIds, userIds, weekStartsOn),
    getMonthlyInvoiceTotalsByCreator(wsId, walletIds, userIds),
  ]);

  const chartProps: InvoiceTotalsChartProps = {
    dailyWalletData,
    weeklyWalletData,
    monthlyWalletData,
    dailyCreatorData,
    weeklyCreatorData,
    monthlyCreatorData,
    hasDateRange: false,
    className,
  };

  return <InvoiceTotalsChart {...chartProps} />;
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
