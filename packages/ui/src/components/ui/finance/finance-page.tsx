import {
  type InternalApiClientOptions,
  listTransactions,
  withForwardedInternalApiAuth,
} from '@tuturuuu/internal-api';
import type { Transaction } from '@tuturuuu/types/primitives/Transaction';
import { CustomDataTable } from '@tuturuuu/ui/custom/tables/custom-data-table';
import { BudgetAlerts } from '@tuturuuu/ui/finance/budgets/budget-alerts';
import { FinanceOverviewMetrics } from '@tuturuuu/ui/finance/finance-overview-metrics';
import { CategoryBreakdownChart } from '@tuturuuu/ui/finance/shared/charts/category-breakdown-chart';
import { DailyTotalChartClient } from '@tuturuuu/ui/finance/shared/charts/daily-total-chart-client';
import { MonthlyTotalChartClient } from '@tuturuuu/ui/finance/shared/charts/monthly-total-chart-client';
import ConfidentialToggle from '@tuturuuu/ui/finance/shared/confidential-toggle';
import { DashboardHeader } from '@tuturuuu/ui/finance/shared/dashboard-header';
import { Filter } from '@tuturuuu/ui/finance/shared/filter';
import LoadingStatisticCard from '@tuturuuu/ui/finance/shared/loaders/statistics';
import type { FinanceDashboardSearchParams } from '@tuturuuu/ui/finance/shared/metrics';
import { transactionColumns } from '@tuturuuu/ui/finance/transactions/columns';
import { Separator } from '@tuturuuu/ui/separator';
import {
  getPermissions,
  type PermissionsResult,
} from '@tuturuuu/utils/workspace-helper';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

interface Props {
  wsId: string;
  searchParams: FinanceDashboardSearchParams;
  currency?: string;
  isPersonalWorkspace?: boolean;
  financePrefix?: string;
  internalApiOptions?: InternalApiClientOptions;
  permissions?: PermissionsResult;
}

export default async function FinancePage({
  wsId,
  searchParams,
  currency = 'USD',
  isPersonalWorkspace = false,
  financePrefix = '/finance',
  internalApiOptions,
  permissions,
}: Props) {
  const sp = searchParams;

  const resolvedPermissions = permissions ?? (await getPermissions({ wsId }));
  if (!resolvedPermissions) return notFound();
  const { containsPermission } = resolvedPermissions;

  if (!containsPermission('view_finance_stats')) return notFound();

  // Check if user has permission to view confidential amounts
  const canViewConfidentialAmount = containsPermission(
    'view_confidential_amount'
  );

  // Parse includeConfidential from URL param (defaults to true if not set)
  const includeConfidentialBool = sp.includeConfidential !== 'false';

  const resolvedInternalApiOptions =
    internalApiOptions ?? withForwardedInternalApiAuth(await headers());
  const { data: recentTransactions } = await getRecentTransactions(
    wsId,
    resolvedInternalApiOptions
  );

  // Map recent transactions to match the data structure expected by CustomDataTable
  const transactionsData = (recentTransactions as Transaction[]).map((d) => ({
    ...d,
    href: `/${wsId}${financePrefix}/transactions/${d.id}`,
    ws_id: wsId,
  })) as Transaction[];

  return (
    <>
      <DashboardHeader />

      <Filter className="mb-4" />

      {canViewConfidentialAmount && (
        <ConfidentialToggle hasPermission={canViewConfidentialAmount} />
      )}

      <BudgetAlerts wsId={wsId} className="mb-4" currency={currency} />

      <div className="grid items-end gap-3 sm:gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Suspense fallback={<FinanceOverviewMetricsFallback />}>
          <FinanceOverviewMetrics
            wsId={wsId}
            currency={currency}
            financePrefix={financePrefix}
            internalApiOptions={resolvedInternalApiOptions}
            permissions={resolvedPermissions}
            searchParams={sp}
          />
        </Suspense>

        <Separator className="col-span-full my-3 sm:my-4" />

        <DailyTotalChartClient
          wsId={wsId}
          currency={currency}
          includeConfidential={includeConfidentialBool}
          className="col-span-full"
        />

        <Separator className="col-span-full my-3 sm:my-4" />

        <MonthlyTotalChartClient
          wsId={wsId}
          currency={currency}
          includeConfidential={includeConfidentialBool}
          className="col-span-full"
        />

        <Separator className="col-span-full my-3 sm:my-4" />

        <CategoryBreakdownChart
          wsId={wsId}
          currency={currency}
          includeConfidential={includeConfidentialBool}
          className="col-span-full"
        />

        <Separator className="col-span-full my-3 sm:my-4" />

        <CustomDataTable
          data={transactionsData}
          columnGenerator={transactionColumns}
          extraData={{ currency, isPersonalWorkspace }}
          namespace="transaction-data-table"
          className="col-span-full"
          defaultVisibility={{
            id: false,
            report_opt_in: false,
            created_at: false,
          }}
          hideToolbar
          hidePagination
        />
      </div>
    </>
  );
}

function FinanceOverviewMetricsFallback() {
  return Array.from({ length: 8 }, (_, index) => (
    <LoadingStatisticCard key={index} />
  ));
}

async function getRecentTransactions(
  wsId: string,
  internalApiOptions: InternalApiClientOptions
) {
  const data = await listTransactions(
    wsId,
    {
      itemsPerPage: 10,
      page: 1,
    },
    internalApiOptions
  );

  return { data };
}
