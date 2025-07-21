'use client';

import {
  ExpenseStatistics,
  IncomeStatistics,
  InvoicesStatistics,
  TotalBalanceStatistics,
  TransactionCategoriesStatistics,
  TransactionsStatistics,
  WalletsStatistics,
} from '../../(dashboard)/statistics';
import type { FinanceDashboardSearchParams } from './page';
import LoadingStatisticCard from '@/components/loading-statistic-card';
import { Suspense } from 'react';

export default function FinanceMetrics({
  wsId,
  searchParams: sp,
}: {
  wsId: string;
  searchParams: FinanceDashboardSearchParams;
}) {
  // const [showFinanceStats, setShowFinanceStats] = useState(false);

  return (
    <>
      {/* <FinanceToggle value={showFinanceStats} onChange={setShowFinanceStats} /> */}

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
    </>
  );
}
