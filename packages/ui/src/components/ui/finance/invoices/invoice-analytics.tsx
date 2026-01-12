import { createClient } from '@tuturuuu/supabase/next/server';
import type { InvoiceTotalsChartProps } from './charts/invoice-totals-chart';
import { InvoiceTotalsChart } from './charts/invoice-totals-chart';

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
}

export async function InvoiceAnalytics({
  wsId,
  filters,
  className,
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
      }),
      getInvoiceTotalsByDateRange(wsId, {
        walletIds,
        userIds,
        startDate: startDate!,
        endDate: endDate!,
        groupByCreator: true,
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
    getWeeklyInvoiceTotals(wsId, walletIds, userIds),
    getMonthlyInvoiceTotals(wsId, walletIds, userIds),
    getDailyInvoiceTotalsByCreator(wsId, walletIds, userIds),
    getWeeklyInvoiceTotalsByCreator(wsId, walletIds, userIds),
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
  userIds?: string[]
): Promise<InvoiceTotalsByGroup[]> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc(
    'get_weekly_invoice_totals' as 'get_daily_income_expense',
    {
      _ws_id: wsId,
      past_weeks: 12,
      wallet_ids: walletIds?.length ? walletIds : null,
      user_ids: userIds?.length ? userIds : null,
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

// Creator-grouped versions
async function getDailyInvoiceTotalsByCreator(
  wsId: string,
  walletIds?: string[],
  userIds?: string[]
): Promise<InvoiceTotalsByGroup[]> {
  const supabase = await createClient();

  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 13);

  const { data, error } = await supabase.rpc(
    'get_invoice_totals_by_date_range' as 'get_daily_income_expense',
    {
      _ws_id: wsId,
      start_date: startDate.toISOString().split('T')[0],
      end_date: endDate.toISOString().split('T')[0],
      wallet_ids: walletIds?.length ? walletIds : null,
      user_ids: userIds?.length ? userIds : null,
      group_by_creator: true,
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
  userIds?: string[]
): Promise<InvoiceTotalsByGroup[]> {
  const supabase = await createClient();

  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 12 * 7 + 1);

  const { data, error } = await supabase.rpc(
    'get_invoice_totals_by_date_range' as 'get_daily_income_expense',
    {
      _ws_id: wsId,
      start_date: startDate.toISOString().split('T')[0],
      end_date: endDate.toISOString().split('T')[0],
      wallet_ids: walletIds?.length ? walletIds : null,
      user_ids: userIds?.length ? userIds : null,
      group_by_creator: true,
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

  const endDate = new Date();
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - 11);
  startDate.setDate(1);

  const { data, error } = await supabase.rpc(
    'get_invoice_totals_by_date_range' as 'get_daily_income_expense',
    {
      _ws_id: wsId,
      start_date: startDate.toISOString().split('T')[0],
      end_date: endDate.toISOString().split('T')[0],
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
