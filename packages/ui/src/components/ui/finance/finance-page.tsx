import { createClient } from '@tuturuuu/supabase/next/server';
import type { Transaction } from '@tuturuuu/types/primitives/Transaction';
import { CustomDataTable } from '@tuturuuu/ui/custom/tables/custom-data-table';
import { BudgetAlerts } from '@tuturuuu/ui/finance/budgets/budget-alerts';
import { CategoryBreakdownChart } from '@tuturuuu/ui/finance/shared/charts/category-breakdown-chart';
import { DailyTotalChartClient } from '@tuturuuu/ui/finance/shared/charts/daily-total-chart-client';
import { MonthlyTotalChartClient } from '@tuturuuu/ui/finance/shared/charts/monthly-total-chart-client';
import ConfidentialToggle from '@tuturuuu/ui/finance/shared/confidential-toggle';
import { DashboardHeader } from '@tuturuuu/ui/finance/shared/dashboard-header';
import { Filter } from '@tuturuuu/ui/finance/shared/filter';
import LoadingStatisticCard from '@tuturuuu/ui/finance/shared/loaders/statistics';
import type { FinanceDashboardSearchParams } from '@tuturuuu/ui/finance/shared/metrics';
import InvoicesStatistics from '@tuturuuu/ui/finance/statistics/invoices';
import TransactionCategoriesStatistics from '@tuturuuu/ui/finance/statistics/transaction-categories';
import TransactionsStatistics from '@tuturuuu/ui/finance/statistics/transactions';
import WalletsStatistics from '@tuturuuu/ui/finance/statistics/wallets';
import { transactionColumns } from '@tuturuuu/ui/finance/transactions/columns';
import { Separator } from '@tuturuuu/ui/separator';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

interface Props {
  wsId: string;
  searchParams: FinanceDashboardSearchParams;
  currency?: string;
  isPersonalWorkspace?: boolean;
  financePrefix?: string;
}

export default async function FinancePage({
  wsId,
  searchParams,
  currency = 'USD',
  isPersonalWorkspace = false,
  financePrefix = '/finance',
}: Props) {
  const sp = searchParams;

  const { containsPermission } = await getPermissions({ wsId });

  if (!containsPermission('view_finance_stats')) return notFound();

  // Check if user has permission to view confidential amounts
  const canViewConfidentialAmount = containsPermission(
    'view_confidential_amount'
  );

  // Parse includeConfidential from URL param (defaults to true if not set)
  const includeConfidentialBool = sp.includeConfidential !== 'false';

  const { data: recentTransactions } = await getRecentTransactions(wsId);

  // Map recent transactions to match the data structure expected by CustomDataTable
  const transactionsData = recentTransactions.map((d) => ({
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

      <BudgetAlerts wsId={wsId} className="mb-4" />

      <div className="grid items-end gap-3 sm:gap-4 md:grid-cols-2 xl:grid-cols-4">
        {/*<Suspense fallback={<LoadingStatisticCard className="md:col-span-2" />}>
          <TotalBalanceStatistics
            wsId={wsId}
            currency={currency}
            searchParams={sp}
          />
        </Suspense>

        <Suspense fallback={<LoadingStatisticCard />}>
          <IncomeStatistics wsId={wsId} currency={currency} searchParams={sp} />
        </Suspense>

        <Suspense fallback={<LoadingStatisticCard />}>
          <ExpenseStatistics
            wsId={wsId}
            currency={currency}
            searchParams={sp}
          />
        </Suspense>

        <Suspense fallback={<LoadingStatisticCard />}>
          <MonthlyIncomeStatistics
            wsId={wsId}
            currency={currency}
            searchParams={sp}
          />
        </Suspense>

        <Suspense fallback={<LoadingStatisticCard />}>
          <MonthlyExpenseStatistics
            wsId={wsId}
            currency={currency}
            searchParams={sp}
          />
        </Suspense>*/}

        <Suspense fallback={<LoadingStatisticCard />}>
          <WalletsStatistics wsId={wsId} searchParams={sp} />
        </Suspense>

        <Suspense fallback={<LoadingStatisticCard />}>
          <TransactionCategoriesStatistics wsId={wsId} searchParams={sp} />
        </Suspense>

        <Suspense fallback={<LoadingStatisticCard />}>
          <TransactionsStatistics wsId={wsId} searchParams={sp} />
        </Suspense>

        <Suspense fallback={<LoadingStatisticCard />}>
          <InvoicesStatistics wsId={wsId} searchParams={sp} />
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

async function getRecentTransactions(wsId: string) {
  const supabase = await createClient();

  // Use RPC function to get redacted transactions with confidential filtering
  const { data: transactions, error } = await supabase.rpc(
    'get_wallet_transactions_with_permissions',
    {
      p_ws_id: wsId,
      p_order_by: 'taken_at',
      p_order_direction: 'DESC',
      p_limit: 10,
    }
  );

  if (error) throw error;

  const filteredTransactions = transactions || [];

  if (filteredTransactions.length === 0) {
    return { data: [] };
  }

  // Get unique wallet IDs and category IDs
  const walletIds = [
    ...new Set(
      filteredTransactions.map((t: any) => t.wallet_id).filter(Boolean)
    ),
  ];
  const categoryIds = [
    ...new Set(
      filteredTransactions.map((t: any) => t.category_id).filter(Boolean)
    ),
  ];

  // Fetch wallet names
  const walletMap = new Map<string, string>();
  if (walletIds.length > 0) {
    const { data: wallets, error: walletError } = await supabase
      .from('workspace_wallets')
      .select('id, name')
      .in('id', walletIds)
      .eq('ws_id', wsId);

    if (!walletError && wallets) {
      wallets.forEach((w) => {
        if (w.id && w.name) walletMap.set(w.id, w.name);
      });
    }
  }

  // Fetch category names
  const categoryMap = new Map<string, string>();
  if (categoryIds.length > 0) {
    const { data: categories, error: categoryError } = await supabase
      .from('transaction_categories')
      .select('id, name')
      .in('id', categoryIds);

    if (!categoryError && categories) {
      categories.forEach((c) => {
        if (c.id && c.name) categoryMap.set(c.id, c.name);
      });
    }
  }

  // Combine transaction data with wallet/category names
  const data = filteredTransactions.map((transaction: any) => ({
    ...transaction,
    wallet: transaction.wallet_id ? walletMap.get(transaction.wallet_id) : null,
    category: transaction.category_id
      ? categoryMap.get(transaction.category_id)
      : null,
  }));

  return { data };
}
