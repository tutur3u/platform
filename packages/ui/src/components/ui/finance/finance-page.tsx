import { createClient } from '@tuturuuu/supabase/next/server';
import type { Transaction } from '@tuturuuu/types/primitives/Transaction';
import { CustomDataTable } from '@tuturuuu/ui/custom/tables/custom-data-table';
import { BudgetAlerts } from '@tuturuuu/ui/finance/budgets/budget-alerts';
import { DailyTotalChart } from '@tuturuuu/ui/finance/shared/charts/daily-total-chart';
import { MonthlyTotalChart } from '@tuturuuu/ui/finance/shared/charts/monthly-total-chart';
import ConfidentialToggle from '@tuturuuu/ui/finance/shared/confidential-toggle';
import { DashboardHeader } from '@tuturuuu/ui/finance/shared/dashboard-header';
import { Filter } from '@tuturuuu/ui/finance/shared/filter';
import LoadingStatisticCard from '@tuturuuu/ui/finance/shared/loaders/statistics';
import type { FinanceDashboardSearchParams } from '@tuturuuu/ui/finance/shared/metrics';
import ExpenseStatistics from '@tuturuuu/ui/finance/statistics/expense';
import IncomeStatistics from '@tuturuuu/ui/finance/statistics/income';
import InvoicesStatistics from '@tuturuuu/ui/finance/statistics/invoices';
import TotalBalanceStatistics from '@tuturuuu/ui/finance/statistics/total-balance';
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
}

export default async function FinancePage({ wsId, searchParams }: Props) {
  const sp = searchParams;

  const { containsPermission, permissions } = await getPermissions({ wsId });

  if (!containsPermission('view_finance_stats')) return notFound();

  // Check if user has permission to view confidential amounts
  const canViewConfidentialAmount = permissions.includes(
    'view_confidential_amount'
  );

  // Parse includeConfidential from URL param (defaults to true if not set)
  const includeConfidentialBool = sp.includeConfidential !== 'false';

  const { data: dailyData } = await getDailyData(wsId, includeConfidentialBool);
  const { data: monthlyData } = await getMonthlyData(
    wsId,
    includeConfidentialBool
  );

  const { data: recentTransactions } = await getRecentTransactions(wsId);

  // Map recent transactions to match the data structure expected by CustomDataTable
  const transactionsData = recentTransactions.map((d) => ({
    ...d,
    href: `/${wsId}/finance/transactions/${d.id}`,
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

      <div className="grid items-end gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Suspense fallback={<LoadingStatisticCard className="md:col-span-2" />}>
          <TotalBalanceStatistics wsId={wsId} searchParams={sp} />
        </Suspense>

        <Suspense fallback={<LoadingStatisticCard />}>
          <IncomeStatistics wsId={wsId} searchParams={sp} />
        </Suspense>

        <Suspense fallback={<LoadingStatisticCard />}>
          <ExpenseStatistics wsId={wsId} searchParams={sp} />
        </Suspense>

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

        <Separator className="col-span-full my-4" />

        <DailyTotalChart data={dailyData} className="col-span-full" />

        <Separator className="col-span-full my-4" />

        <MonthlyTotalChart data={monthlyData} className="col-span-full mb-8" />

        <Separator className="col-span-full my-4" />

        <CustomDataTable
          data={transactionsData}
          columnGenerator={transactionColumns}
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

async function getDailyData(wsId: string, includeConfidential: boolean) {
  const supabase = await createClient();

  const queryBuilder = supabase.rpc('get_daily_income_expense', {
    _ws_id: wsId,
    include_confidential: includeConfidential,
  });

  const { data, error, count } = await queryBuilder;
  if (error) throw error;

  return { data: data || [], count };
}

async function getMonthlyData(wsId: string, includeConfidential: boolean) {
  const supabase = await createClient();

  const queryBuilder = supabase.rpc('get_monthly_income_expense', {
    _ws_id: wsId,
    include_confidential: includeConfidential,
  });

  const { data, error, count } = await queryBuilder;
  if (error) throw error;

  return { data: data || [], count };
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
