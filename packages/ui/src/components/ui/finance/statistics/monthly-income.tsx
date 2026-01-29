import { Calendar } from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/server';
import type { FinanceDashboardSearchParams } from '@tuturuuu/ui/finance/shared/metrics';
import StatisticCard from '@tuturuuu/ui/finance/statistics/card';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import dayjs from 'dayjs';
import { getTranslations } from 'next-intl/server';

const enabled = true;

export default async function MonthlyIncomeStatistics({
  wsId,
  currency = 'USD',
  searchParams: { includeConfidential } = {},
}: {
  wsId: string;
  currency?: string;
  searchParams?: FinanceDashboardSearchParams;
}) {
  const supabase = await createClient();
  const t = await getTranslations();

  // Parse includeConfidential from URL param (defaults to true if not set)
  const includeConfidentialBool = includeConfidential !== 'false';

  // Always use current month's date range
  const startOfMonth = dayjs().startOf('month').toISOString();
  const endOfMonth = dayjs().endOf('month').toISOString();

  const { data: income } = enabled
    ? await supabase.rpc('get_workspace_wallets_income', {
        ws_id: wsId,
        start_date: startOfMonth,
        end_date: endOfMonth,
        include_confidential: includeConfidentialBool,
      })
    : { data: 0 };

  const { permissions } = await getPermissions({
    wsId,
  });

  if (!enabled || !permissions.includes('manage_finance')) return null;

  // Get current month name for the title
  const currentMonth = dayjs().format('MMMM');

  return (
    <StatisticCard
      title={`${t('finance-overview.monthly-income')} (${currentMonth})`}
      value={income || 0}
      icon={<Calendar className="h-5 w-5" />}
      currency={currency}
      locale={currency === 'VND' ? 'vi-VN' : 'en-US'}
    />
  );
}
