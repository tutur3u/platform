import { FolderTree } from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/server';
import type { FinanceDashboardSearchParams } from '@tuturuuu/ui/finance/shared/metrics';
import StatisticCard from '@tuturuuu/ui/finance/statistics/card';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { getTranslations } from 'next-intl/server';

const enabled = true;

export default async function TransactionCategoriesStatistics({
  wsId,
  financePrefix = '/finance',
}: {
  wsId: string;
  searchParams?: FinanceDashboardSearchParams;
  financePrefix?: string;
}) {
  const supabase = await createClient();
  const t = await getTranslations();

  const { count: categoriesCount } = enabled
    ? await supabase
        .from('transaction_categories')
        .select('*', {
          count: 'exact',
          head: true,
        })
        .eq('ws_id', wsId)
    : { count: 0 };

  const { containsPermission } = await getPermissions({
    wsId,
  });

  if (!enabled || !containsPermission('manage_finance')) return null;

  return (
    <StatisticCard
      title={t('workspace-finance-tabs.categories')}
      value={categoriesCount}
      href={`/${wsId}${financePrefix}/transactions/categories`}
      icon={<FolderTree className="h-5 w-5" />}
    />
  );
}
