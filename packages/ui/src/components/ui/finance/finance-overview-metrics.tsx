import {
  Activity,
  ArrowDownRight,
  ArrowRightLeft,
  ArrowUpRight,
  CircleAlert,
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
  if (!permissions.containsPermission('view_finance_stats')) return null;

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
  const reconciliationHref = `${transactionsHref}?reconciliation=needs-wallet`;
  const canManageFinance = permissions.containsPermission('manage_finance');
  const currencyAmount = (
    values: Array<{ amount: number; currency: string }>
  ) => values.find((item) => item.currency === currency)?.amount ?? 0;
  const pending = metrics.inventoryPending.find(
    (item) => item.currency === currency
  );

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
      {canManageFinance && (
        <>
          <StatisticCard
            title={t('inventory-finance-reconciliation.pending_metric')}
            value={t('inventory-finance-reconciliation.pending_metric_value', {
              amount: new Intl.NumberFormat(
                currency === 'VND' ? 'vi-VN' : 'en-US',
                { currency, style: 'currency' }
              ).format(pending?.amount ?? 0),
              count: pending?.count ?? 0,
            })}
            href={reconciliationHref}
            icon={<CircleAlert className="h-5 w-5" />}
          />
          <StatisticCard
            title={t('inventory-finance-reconciliation.gross_provider_sales')}
            value={currencyAmount(metrics.inventoryReconciliation.grossSales)}
            href={reconciliationHref}
            icon={<ArrowUpRight className="h-5 w-5" />}
            currency={currency}
          />
          <StatisticCard
            title={t('inventory-finance-reconciliation.refunds_chargebacks')}
            value={
              currencyAmount(metrics.inventoryReconciliation.refunds) +
              currencyAmount(metrics.inventoryReconciliation.chargebackHolds)
            }
            href={reconciliationHref}
            icon={<ArrowDownRight className="h-5 w-5" />}
            currency={currency}
          />
          <StatisticCard
            title={t('inventory-finance-reconciliation.net_provider_sales')}
            value={currencyAmount(metrics.inventoryReconciliation.netSales)}
            href={reconciliationHref}
            icon={<ArrowRightLeft className="h-5 w-5" />}
            currency={currency}
          />
        </>
      )}
    </>
  );
}
