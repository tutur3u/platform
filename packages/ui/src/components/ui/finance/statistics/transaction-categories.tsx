import { FolderTree } from '@tuturuuu/icons';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { FinanceDashboardSearchParams } from '@tuturuuu/ui/finance/shared/metrics';
import StatisticCard from '@tuturuuu/ui/finance/statistics/card';
import {
  getPermissions,
  type PermissionsResult,
} from '@tuturuuu/utils/workspace-helper';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

const enabled = true;

export default async function TransactionCategoriesStatistics({
  wsId,
  financePrefix = '/finance',
  permissions,
}: {
  wsId: string;
  searchParams?: FinanceDashboardSearchParams;
  financePrefix?: string;
  permissions?: PermissionsResult;
}) {
  const t = await getTranslations();
  const resolvedPermissions =
    permissions ??
    (await getPermissions({
      wsId,
    }));
  if (!resolvedPermissions) notFound();
  const { containsPermission } = resolvedPermissions;

  if (!enabled || !containsPermission('manage_finance')) return null;

  const sbAdmin = await createAdminClient();

  const { count: categoriesCount } = enabled
    ? await sbAdmin
        .from('transaction_categories')
        .select('*', {
          count: 'exact',
          head: true,
        })
        .eq('ws_id', wsId)
    : { count: 0 };

  return (
    <StatisticCard
      title={t('workspace-finance-tabs.categories')}
      value={categoriesCount}
      href={
        financePrefix
          ? `/${wsId}${financePrefix}/transactions/categories`
          : `/${wsId}/categories`
      }
      icon={<FolderTree className="h-5 w-5" />}
    />
  );
}
