import { createClient } from '@tuturuuu/supabase/next/server';
import type { Transaction } from '@tuturuuu/types/primitives/Transaction';
import { CustomDataTable } from '@tuturuuu/ui/custom/tables/custom-data-table';
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
import { Suspense } from 'react';

interface Props {
  wsId: string;
  searchParams: FinanceDashboardSearchParams;
}

export default async function FinancePage({ wsId, searchParams }: Props) {
  const sp = searchParams;

  // const { data: dailyData } = await getDailyData(wsId);
  // const { data: monthlyData } = await getMonthlyData(wsId);

  const { data: recentTransactions } = await getRecentTransactions(wsId);

  // Map recent transactions to match the data structure expected by CustomDataTable
  const transactionsData = recentTransactions.map((d) => ({
    ...d,
    href: `/${wsId}/finance/transactions/${d.id}`,
    ws_id: wsId,
  })) as Transaction[];

  return (
    <>
      <Filter className="mb-4" />
      {/* <FinanceMetrics wsId={wsId} searchParams={sp} /> */}

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

        {/* <Suspense fallback={<LoadingStatisticCard className="col-span-full" />}>
          <Separator className="col-span-full mb-4" />
          <DailyTotalChart data={dailyData} className="col-span-full" />
          <Separator className="col-span-full my-4" />
          <MonthlyTotalChart
            data={monthlyData}
            className="col-span-full mb-8"
          />
          <Separator className="col-span-full my-4" />
        </Suspense> */}

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

// async function getDailyData(wsId: string) {
//   const supabase = await createClient();

//   const queryBuilder = supabase.rpc('get_daily_income_expense', {
//     _ws_id: wsId,
//   });

//   const { data, error, count } = await queryBuilder;
//   if (error) throw error;

//   return { data, count };
// }

// async function getMonthlyData(wsId: string) {
//   const supabase = await createClient();

//   const queryBuilder = supabase.rpc('get_monthly_income_expense', {
//     _ws_id: wsId,
//   });

//   const { data, error, count } = await queryBuilder;
//   if (error) throw error;

//   return { data, count };
// }

async function getRecentTransactions(wsId: string) {
  const supabase = await createClient();

  const queryBuilder = supabase
    .from('wallet_transactions')
    .select(
      '*, workspace_wallets!inner(name, ws_id), transaction_categories(name)',
      {
        count: 'exact',
      }
    )
    .eq('workspace_wallets.ws_id', wsId)
    .order('taken_at', { ascending: false })
    .limit(10);

  const { data: rawData, error } = await queryBuilder;

  if (error) throw error;

  const data = rawData.map(
    ({ workspace_wallets, transaction_categories, ...rest }) => ({
      ...rest,
      wallet: workspace_wallets?.name,
      category: transaction_categories?.name,
    })
  );

  return { data };
}
