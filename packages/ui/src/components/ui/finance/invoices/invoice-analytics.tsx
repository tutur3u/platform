import { createClient } from '@tuturuuu/supabase/next/server';
import type { InvoiceTotalsByPeriod } from '@tuturuuu/types/primitives/Invoice';
import { InvoiceTotalsChart } from './charts/invoice-totals-chart';

interface InvoiceAnalyticsProps {
  wsId: string;
  walletIds?: string[];
  className?: string;
}

export async function InvoiceAnalytics({
  wsId,
  walletIds,
  className,
}: InvoiceAnalyticsProps) {
  const [dailyData, weeklyData, monthlyData] = await Promise.all([
    getDailyInvoiceTotals(wsId, walletIds),
    getWeeklyInvoiceTotals(wsId, walletIds),
    getMonthlyInvoiceTotals(wsId, walletIds),
  ]);

  return (
    <InvoiceTotalsChart
      dailyData={dailyData}
      weeklyData={weeklyData}
      monthlyData={monthlyData}
      className={className}
    />
  );
}

async function getDailyInvoiceTotals(
  wsId: string,
  walletIds?: string[]
): Promise<InvoiceTotalsByPeriod[]> {
  const supabase = await createClient();

  // Note: RPC function will be available after migration is applied and types regenerated
  const { data, error } = await supabase.rpc(
    'get_daily_invoice_totals' as 'get_daily_income_expense',
    {
      _ws_id: wsId,
      past_days: 14,
      wallet_ids: walletIds?.length ? walletIds : null,
    } as any
  );

  if (error) {
    console.error('Error fetching daily invoice totals:', error);
    return [];
  }

  return (data || []).map((item: any) => ({
    period: item.period,
    wallet_id: item.wallet_id,
    wallet_name: item.wallet_name || 'Unknown',
    total_amount: Number(item.total_amount) || 0,
    invoice_count: Number(item.invoice_count) || 0,
  }));
}

async function getWeeklyInvoiceTotals(
  wsId: string,
  walletIds?: string[]
): Promise<InvoiceTotalsByPeriod[]> {
  const supabase = await createClient();

  // Note: RPC function will be available after migration is applied and types regenerated
  const { data, error } = await supabase.rpc(
    'get_weekly_invoice_totals' as 'get_daily_income_expense',
    {
      _ws_id: wsId,
      past_weeks: 12,
      wallet_ids: walletIds?.length ? walletIds : null,
    } as any
  );

  if (error) {
    console.error('Error fetching weekly invoice totals:', error);
    return [];
  }

  return (data || []).map((item: any) => ({
    period: item.period,
    wallet_id: item.wallet_id,
    wallet_name: item.wallet_name || 'Unknown',
    total_amount: Number(item.total_amount) || 0,
    invoice_count: Number(item.invoice_count) || 0,
  }));
}

async function getMonthlyInvoiceTotals(
  wsId: string,
  walletIds?: string[]
): Promise<InvoiceTotalsByPeriod[]> {
  const supabase = await createClient();

  // Note: RPC function will be available after migration is applied and types regenerated
  const { data, error } = await supabase.rpc(
    'get_monthly_invoice_totals' as 'get_daily_income_expense',
    {
      _ws_id: wsId,
      past_months: 12,
      wallet_ids: walletIds?.length ? walletIds : null,
    } as any
  );

  if (error) {
    console.error('Error fetching monthly invoice totals:', error);
    return [];
  }

  return (data || []).map((item: any) => ({
    period: item.period,
    wallet_id: item.wallet_id,
    wallet_name: item.wallet_name || 'Unknown',
    total_amount: Number(item.total_amount) || 0,
    invoice_count: Number(item.invoice_count) || 0,
  }));
}
