import type { FinanceDashboardSearchParams } from '../finance/(dashboard)/page';
import { FinanceCategoryStatistics } from './categories/finance';
import FinanceToggle from './finance-toggle';
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
  const sp = await searchParams;
  const { showFinanceStats } = sp;

  return (
    <>
      <FinanceCategoryStatistics wsId={wsId} />
      <FinanceToggle />

      {showFinanceStats ? (
        <div className="grid items-end gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Suspense
            fallback={<LoadingStatisticCard className="md:col-span-2" />}
          >
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
        </div>
      ) : null}
    </>
  );
}
