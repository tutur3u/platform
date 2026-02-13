import { TrendingDown } from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/server';
import type { FinanceDashboardSearchParams } from '@tuturuuu/ui/finance/shared/metrics';
import StatisticCard from '@tuturuuu/ui/finance/statistics/card';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import dayjs, { type OpUnitType } from 'dayjs';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

const enabled = true;

export default async function ExpenseStatistics({
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

  const { data: expense } = enabled
    ? await supabase.rpc('get_workspace_wallets_expense', {
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

  const permissions = await getPermissions({
    wsId,
  });
  if (!permissions) notFound();
  const { containsPermission } = permissions;

  if (!enabled || !containsPermission('manage_finance')) return null;

  return (
    <StatisticCard
      title={t('finance-overview.total-expense')}
      value={expense || 0}
      icon={<TrendingDown className="h-5 w-5" />}
      currency={currency}
      locale={currency === 'VND' ? 'vi-VN' : 'en-US'}
    />
  );
}
