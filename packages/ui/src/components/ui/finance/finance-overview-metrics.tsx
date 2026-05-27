import {
  Activity,
  ArrowDownRight,
  ArrowRightLeft,
  ArrowUpRight,
  FileText,
  FolderTree,
  Wallet2,
} from '@tuturuuu/icons';
import {
  getFinanceOverviewMetrics,
  type InternalApiClientOptions,
} from '@tuturuuu/internal-api';
import type { FinanceDashboardSearchParams } from '@tuturuuu/ui/finance/shared/metrics';
import StatisticCard from '@tuturuuu/ui/finance/statistics/card';
import type { PermissionsResult } from '@tuturuuu/utils/workspace-helper';
import { getTranslations } from 'next-intl/server';

type OverviewView = 'date' | 'month' | 'year';

interface FinanceOverviewMetricsProps {
  currency: string;
  financePrefix?: string;
  internalApiOptions: InternalApiClientOptions;
  permissions: PermissionsResult;
  searchParams: FinanceDashboardSearchParams;
  wsId: string;
}

function normalizeOverviewView(view: string | undefined): OverviewView {
  if (view === 'month' || view === 'year') return view;
  return 'date';
}

export async function FinanceOverviewMetrics({
  currency,
  financePrefix = '/finance',
  internalApiOptions,
  permissions,
  searchParams,
  wsId,
}: FinanceOverviewMetricsProps) {
  if (!permissions.containsPermission('manage_finance')) return null;

  const t = await getTranslations();
  const metrics = await getFinanceOverviewMetrics(
    wsId,
    {
      endDate: searchParams.endDate,
      includeConfidential: searchParams.includeConfidential !== 'false',
      startDate: searchParams.startDate,
      view: normalizeOverviewView(searchParams.view),
    },
    internalApiOptions
  );

  const transactionsHref = `/${wsId}${financePrefix}/transactions`;

  return (
    <>
      <StatisticCard
        title={t('workspace-finance-tabs.wallets')}
        value={metrics.walletCount}
        href={`/${wsId}${financePrefix}/wallets`}
        icon={<Wallet2 className="h-5 w-5" />}
      />
      <StatisticCard
        title={t('workspace-finance-tabs.categories')}
        value={metrics.categoryCount}
        href={
          financePrefix
            ? `/${wsId}${financePrefix}/transactions/categories`
            : `/${wsId}/categories`
        }
        icon={<FolderTree className="h-5 w-5" />}
      />
      <StatisticCard
        title={t('workspace-finance-tabs.transactions')}
        value={metrics.transactionCount}
        href={transactionsHref}
        icon={<ArrowRightLeft className="h-5 w-5" />}
      />
      <StatisticCard
        title={t('workspace-finance-tabs.invoices')}
        value={metrics.invoiceCount}
        href={`/${wsId}${financePrefix}/invoices`}
        icon={<FileText className="h-5 w-5" />}
      />
      <StatisticCard
        title={t('finance-overview.total-income')}
        value={metrics.totalIncome}
        href={transactionsHref}
        icon={<ArrowUpRight className="h-5 w-5" />}
        currency={currency}
      />
      <StatisticCard
        title={t('finance-overview.total-expense')}
        value={metrics.totalExpense}
        href={transactionsHref}
        icon={<ArrowDownRight className="h-5 w-5" />}
        currency={currency}
      />
      <StatisticCard
        title={t('finance-overview.net-total')}
        value={metrics.netTotal}
        href={transactionsHref}
        icon={<ArrowRightLeft className="h-5 w-5" />}
        currency={currency}
      />
      <StatisticCard
        title={t('ws-transaction-tags.recent_pace')}
        value={t('ws-transaction-tags.recent_pace_value', {
          count: metrics.recentTransactionCount,
        })}
        href={transactionsHref}
        icon={<Activity className="h-5 w-5" />}
      />
    </>
  );
}
