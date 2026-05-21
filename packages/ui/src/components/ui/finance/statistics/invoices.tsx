import { FileText } from '@tuturuuu/icons';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { FinanceDashboardSearchParams } from '@tuturuuu/ui/finance/shared/metrics';
import StatisticCard from '@tuturuuu/ui/finance/statistics/card';
import {
  getPermissions,
  type PermissionsResult,
} from '@tuturuuu/utils/workspace-helper';
import dayjs, { type OpUnitType } from 'dayjs';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

const enabled = true;

export default async function InvoicesStatistics({
  wsId,
  searchParams: { view, startDate, endDate } = {},
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

  const getData = async () => {
    const query = sbAdmin
      .from('finance_invoices')
      .select('*', {
        count: 'exact',
        head: true,
      })
      .eq('ws_id', wsId);

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

  const { count: invoicesCount } = enabled ? await getData() : { count: 0 };

  return (
    <StatisticCard
      title={t('workspace-finance-tabs.invoices')}
      value={invoicesCount}
      href={`/${wsId}${financePrefix}/invoices`}
      icon={<FileText className="h-5 w-5" />}
    />
  );
}
