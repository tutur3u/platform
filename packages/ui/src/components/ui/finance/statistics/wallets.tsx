import { Wallet2 } from '@tuturuuu/icons';
import {
  listWallets,
  withForwardedInternalApiAuth,
} from '@tuturuuu/internal-api';
import type { FinanceDashboardSearchParams } from '@tuturuuu/ui/finance/shared/metrics';
import StatisticCard from '@tuturuuu/ui/finance/statistics/card';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { headers } from 'next/headers';
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
  const t = await getTranslations();
  const permissions = await getPermissions({
    wsId,
  });
  if (!permissions) notFound();
  const { containsPermission } = permissions;

  if (!enabled || !containsPermission('manage_finance')) return null;

  const requestHeaders = await headers();
  const internalApiOptions = withForwardedInternalApiAuth(requestHeaders);
  let walletsCount = 0;

  if (enabled) {
    try {
      walletsCount = (await listWallets(wsId, internalApiOptions)).length;
    } catch (error) {
      console.error('Failed to load wallet statistics:', error);
    }
  }

  return (
    <StatisticCard
      title={t('workspace-finance-tabs.wallets')}
      value={walletsCount}
      href={`/${wsId}${financePrefix}/wallets`}
      icon={<Wallet2 className="h-5 w-5" />}
    />
  );
}
