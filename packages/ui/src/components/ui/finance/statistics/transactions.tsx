import { ArrowRightLeft } from '@tuturuuu/icons';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { FinanceDashboardSearchParams } from '@tuturuuu/ui/finance/shared/metrics';
import StatisticCard from '@tuturuuu/ui/finance/statistics/card';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import dayjs, { type OpUnitType } from 'dayjs';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

const enabled = true;

export default async function TransactionsStatistics({
  wsId,
  searchParams: { view, startDate, endDate } = {},
  financePrefix = '/finance',
}: {
  wsId: string;
  searchParams?: FinanceDashboardSearchParams;
  financePrefix?: string;
}) {
  const t = await getTranslations();
  const permissions = await getPermissions({
    wsId,
  });
  if (!permissions) notFound();
  const { containsPermission } = permissions;

  if (!enabled || !containsPermission('manage_finance')) return null;

  const sbAdmin = await createAdminClient();

  const getData = async () => {
    const query = sbAdmin
      .from('wallet_transactions')
      .select('*, workspace_wallets!inner(ws_id)', {
        count: 'exact',
        head: true,
      })
      .eq('workspace_wallets.ws_id', wsId);

    if (startDate && view)
      query.gte(
        'created_at',
        dayjs(startDate)
          .startOf(view as OpUnitType)
          .toISOString()
      );

    if (endDate && view)
      query.lte(
        'created_at',
        dayjs(endDate)
          .endOf(view as OpUnitType)
          .toISOString()
      );

    return query;
  };

  const { count: transactionsCount } = enabled ? await getData() : { count: 0 };

  return (
    <StatisticCard
      title={t('workspace-finance-tabs.transactions')}
      value={transactionsCount}
      href={`/${wsId}${financePrefix}/transactions`}
      icon={<ArrowRightLeft className="h-5 w-5" />}
    />
  );
}
