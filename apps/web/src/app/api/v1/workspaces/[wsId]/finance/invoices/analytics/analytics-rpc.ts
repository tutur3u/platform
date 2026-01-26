import { createClient } from '@tuturuuu/supabase/next/server';
import type { Database } from '@tuturuuu/types';
import type { InvoiceTotalsByGroup } from '@tuturuuu/types/primitives/Invoice';
import dayjs from 'dayjs';

import type { DateRangeParams, WeekStartsOn } from './analytics-types';

type InvoiceTotalsByDateRangeRow =
  Database['public']['Functions']['get_invoice_totals_by_date_range']['Returns'][number];

type DailyInvoiceTotalsRow =
  Database['public']['Functions']['get_daily_invoice_totals']['Returns'][number];

type WeeklyInvoiceTotalsRow =
  Database['public']['Functions']['get_weekly_invoice_totals']['Returns'][number];

type MonthlyInvoiceTotalsRow =
  Database['public']['Functions']['get_monthly_invoice_totals']['Returns'][number];

const mapTotalsByGroup = (
  item: InvoiceTotalsByDateRangeRow
): InvoiceTotalsByGroup => ({
  period: item.period,
  group_id: item.group_id,
  group_name: item.group_name || 'Unknown',
  group_avatar_url: item.group_avatar_url,
  total_amount: Number(item.total_amount) || 0,
  invoice_count: Number(item.invoice_count) || 0,
});

const mapTotalsByWallet = (
  item: DailyInvoiceTotalsRow | WeeklyInvoiceTotalsRow | MonthlyInvoiceTotalsRow
): InvoiceTotalsByGroup => ({
  period: item.period,
  group_id: item.wallet_id,
  group_name: item.wallet_name || 'Unknown',
  group_avatar_url: null,
  total_amount: Number(item.total_amount) || 0,
  invoice_count: Number(item.invoice_count) || 0,
});

/**
 * Helper to calculate start of week based on weekStartsOn preference
 * weekStartsOn: 0=Sunday, 1=Monday, 6=Saturday
 */
const getStartOfWeek = (
  date: dayjs.Dayjs,
  weekStartsOn: WeekStartsOn
): dayjs.Dayjs => {
  const dow = date.day(); // 0=Sunday, 1=Monday, ..., 6=Saturday
  const daysToSubtract = (dow - weekStartsOn + 7) % 7;
  return date.subtract(daysToSubtract, 'day').startOf('day');
};

export const getInvoiceTotalsByDateRange = async (
  wsId: string,
  params: DateRangeParams
): Promise<InvoiceTotalsByGroup[]> => {
  const supabase = await createClient<Database>();

  const { data, error } = await supabase.rpc(
    'get_invoice_totals_by_date_range',
    {
      _ws_id: wsId,
      start_date: params.startDate,
      end_date: params.endDate,
      wallet_ids: params.walletIds?.length ? params.walletIds : undefined,
      user_ids: params.userIds?.length ? params.userIds : undefined,
      group_by_creator: params.groupByCreator,
      week_start_day: params.weekStartsOn ?? 1,
      interval_type: params.intervalType ?? undefined,
    }
  );

  if (error) {
    throw new Error('Error fetching invoice totals by date range', {
      cause: error,
    });
  }

  return (data ?? []).map(mapTotalsByGroup);
};

export const getDailyInvoiceTotals = async (
  wsId: string,
  walletIds?: string[],
  userIds?: string[]
): Promise<InvoiceTotalsByGroup[]> => {
  const supabase = await createClient<Database>();

  const { data, error } = await supabase.rpc('get_daily_invoice_totals', {
    _ws_id: wsId,
    past_days: 14,
    wallet_ids: walletIds?.length ? walletIds : undefined,
    user_ids: userIds?.length ? userIds : undefined,
  });

  if (error) {
    console.error('Error fetching daily invoice totals:', error);
    return [];
  }

  return (data ?? []).map(mapTotalsByWallet);
};

export const getWeeklyInvoiceTotals = async (
  wsId: string,
  walletIds?: string[],
  userIds?: string[],
  weekStartsOn: WeekStartsOn = 1
): Promise<InvoiceTotalsByGroup[]> => {
  const supabase = await createClient<Database>();

  const { data, error } = await supabase.rpc('get_weekly_invoice_totals', {
    _ws_id: wsId,
    past_weeks: 12,
    wallet_ids: walletIds?.length ? walletIds : undefined,
    user_ids: userIds?.length ? userIds : undefined,
    week_start_day: weekStartsOn,
  });

  if (error) {
    console.error('Error fetching weekly invoice totals:', error);
    return [];
  }

  return (data ?? []).map(mapTotalsByWallet);
};

export const getMonthlyInvoiceTotals = async (
  wsId: string,
  walletIds?: string[],
  userIds?: string[]
): Promise<InvoiceTotalsByGroup[]> => {
  const supabase = await createClient<Database>();

  const { data, error } = await supabase.rpc('get_monthly_invoice_totals', {
    _ws_id: wsId,
    past_months: 12,
    wallet_ids: walletIds?.length ? walletIds : undefined,
    user_ids: userIds?.length ? userIds : undefined,
  });

  if (error) {
    console.error('Error fetching monthly invoice totals:', error);
    return [];
  }

  return (data ?? []).map(mapTotalsByWallet);
};

export const getDailyInvoiceTotalsByCreator = async (
  wsId: string,
  walletIds?: string[],
  userIds?: string[],
  weekStartsOn: WeekStartsOn = 1
): Promise<InvoiceTotalsByGroup[]> => {
  const supabase = await createClient<Database>();

  // Match SQL: CURRENT_DATE - INTERVAL '13 days' to CURRENT_DATE (14 days total)
  const endDate = dayjs();
  const startDate = endDate.subtract(13, 'day');

  const { data, error } = await supabase.rpc(
    'get_invoice_totals_by_date_range',
    {
      _ws_id: wsId,
      start_date: startDate.format('YYYY-MM-DD'),
      end_date: endDate.format('YYYY-MM-DD'),
      wallet_ids: walletIds?.length ? walletIds : undefined,
      user_ids: userIds?.length ? userIds : undefined,
      group_by_creator: true,
      week_start_day: weekStartsOn,
    }
  );

  if (error) {
    console.error('Error fetching daily invoice totals by creator:', error);
    return [];
  }

  return (data ?? []).map(mapTotalsByGroup);
};

export const getWeeklyInvoiceTotalsByCreator = async (
  wsId: string,
  walletIds?: string[],
  userIds?: string[],
  weekStartsOn: WeekStartsOn = 1
): Promise<InvoiceTotalsByGroup[]> => {
  const supabase = await createClient<Database>();

  // Calculate week-aligned start date based on user's preference
  const endDate = dayjs();
  const startOfCurrentWeek = getStartOfWeek(endDate, weekStartsOn);
  const startDate = startOfCurrentWeek.subtract(11, 'week');

  const { data, error } = await supabase.rpc(
    'get_invoice_totals_by_date_range',
    {
      _ws_id: wsId,
      start_date: startDate.format('YYYY-MM-DD'),
      end_date: endDate.format('YYYY-MM-DD'),
      wallet_ids: walletIds?.length ? walletIds : undefined,
      user_ids: userIds?.length ? userIds : undefined,
      group_by_creator: true,
      week_start_day: weekStartsOn,
    }
  );

  if (error) {
    console.error('Error fetching weekly invoice totals by creator:', error);
    return [];
  }

  return (data ?? []).map(mapTotalsByGroup);
};

export const getMonthlyInvoiceTotalsByCreator = async (
  wsId: string,
  walletIds?: string[],
  userIds?: string[]
): Promise<InvoiceTotalsByGroup[]> => {
  const supabase = await createClient<Database>();

  // Match SQL: date_trunc('month', CURRENT_DATE) - INTERVAL '1 month' * 11 to CURRENT_DATE
  const endDate = dayjs();
  const startDate = endDate.startOf('month').subtract(11, 'month');

  const { data, error } = await supabase.rpc(
    'get_invoice_totals_by_date_range',
    {
      _ws_id: wsId,
      start_date: startDate.format('YYYY-MM-DD'),
      end_date: endDate.format('YYYY-MM-DD'),
      wallet_ids: walletIds?.length ? walletIds : undefined,
      user_ids: userIds?.length ? userIds : undefined,
      group_by_creator: true,
    }
  );

  if (error) {
    console.error('Error fetching monthly invoice totals by creator:', error);
    return [];
  }

  return (data ?? []).map(mapTotalsByGroup);
};
