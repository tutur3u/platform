import type { FinanceDashboardSearchParams } from '../finance/(dashboard)/page';
import { FinanceCategoryStatistics } from './categories/finance';
import {
  ExpenseStatistics,
  IncomeStatistics,
  InvoicesStatistics,
  TotalBalanceStatistics,
  TransactionCategoriesStatistics,
  TransactionsStatistics,
  WalletsStatistics,
} from './statistics';
import LoadingStatisticCard from '@/components/loading-statistic-card';
import { Suspense } from 'react';

export default async function FinanceStatistics({
  wsId,
  searchParams,
}: {
  wsId: string;
  searchParams: Promise<FinanceDashboardSearchParams>;
}) {
  return (
    <>
      <FinanceCategoryStatistics wsId={wsId} />
      {/* <FinanceToggle /> */}

      <div className="grid items-end gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Suspense fallback={<LoadingStatisticCard className="md:col-span-2" />}>
          <TotalBalanceStatistics
            wsId={wsId}
            searchParams={await searchParams}
          />
        </Suspense>

        <Suspense fallback={<LoadingStatisticCard />}>
          <IncomeStatistics wsId={wsId} searchParams={await searchParams} />
        </Suspense>

        <Suspense fallback={<LoadingStatisticCard />}>
          <ExpenseStatistics wsId={wsId} searchParams={await searchParams} />
        </Suspense>

        <Suspense fallback={<LoadingStatisticCard />}>
          <WalletsStatistics wsId={wsId} searchParams={await searchParams} />
        </Suspense>

        <Suspense fallback={<LoadingStatisticCard />}>
          <TransactionCategoriesStatistics
            wsId={wsId}
            searchParams={await searchParams}
          />
        </Suspense>

        <Suspense fallback={<LoadingStatisticCard />}>
          <TransactionsStatistics
            wsId={wsId}
            searchParams={await searchParams}
          />
        </Suspense>

        <Suspense fallback={<LoadingStatisticCard />}>
          <InvoicesStatistics wsId={wsId} searchParams={await searchParams} />
        </Suspense>
      </div>
    </>
  );
}
