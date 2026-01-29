import { TrendingUp } from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/server';
import type { FinanceDashboardSearchParams } from '@tuturuuu/ui/finance/shared/metrics';
import StatisticCard from '@tuturuuu/ui/finance/statistics/card';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import dayjs, { type OpUnitType } from 'dayjs';
import { getTranslations } from 'next-intl/server';

const enabled = true;

export default async function IncomeStatistics({
  wsId,
  currency = 'USD',
  searchParams: { view, startDate, endDate, includeConfidential } = {},
}: {
  wsId: string;
  currency?: string;
  searchParams?: FinanceDashboardSearchParams;
}) {
  const supabase = await createClient();
  const t = await getTranslations();

  // Parse includeConfidential from URL param (defaults to true if not set)
  const includeConfidentialBool = includeConfidential !== 'false';

  const { data: income } = enabled
    ? await supabase.rpc('get_workspace_wallets_income', {
        ws_id: wsId,
        start_date:
          startDate && view
            ? dayjs(startDate)
                .startOf(view as OpUnitType)
                .toISOString()
            : undefined,
        end_date:
          endDate && view
            ? dayjs(endDate)
                .endOf(view as OpUnitType)
                .toISOString()
            : undefined,
        include_confidential: includeConfidentialBool,
      })
    : { data: 0 };

  const { permissions } = await getPermissions({
    wsId,
  });

  if (!enabled || !permissions.includes('manage_finance')) return null;

  return (
    <StatisticCard
      title={t('finance-overview.total-income')}
      value={income || 0}
      icon={<TrendingUp className="h-5 w-5" />}
      currency={currency}
      locale={currency === 'VND' ? 'vi-VN' : 'en-US'}
    />
  );
}
