import { Wallet2 } from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/server';
import type { FinanceDashboardSearchParams } from '@tuturuuu/ui/finance/shared/metrics';
import StatisticCard from '@tuturuuu/ui/finance/statistics/card';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

const enabled = true;

export default async function WalletsStatistics({
  wsId,
  financePrefix = '/finance',
}: {
  wsId: string;
  searchParams?: FinanceDashboardSearchParams;
  financePrefix?: string;
}) {
  const supabase = await createClient();
  const t = await getTranslations();

  const { count: walletsCount } = enabled
    ? await supabase
        .from('workspace_wallets')
        .select('*', {
          count: 'exact',
          head: true,
        })
        .eq('ws_id', wsId)
    : { count: 0 };

  const permissions = await getPermissions({
    wsId,
  });
  if (!permissions) notFound();
  const { containsPermission } = permissions;

  if (!enabled || !containsPermission('manage_finance')) return null;

  return (
    <StatisticCard
      title={t('workspace-finance-tabs.wallets')}
      value={walletsCount}
      href={`/${wsId}${financePrefix}/wallets`}
      icon={<Wallet2 className="h-5 w-5" />}
    />
  );
}
