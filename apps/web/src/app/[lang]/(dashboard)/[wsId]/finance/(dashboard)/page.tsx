import {
  ExpenseStatistics,
  IncomeStatistics,
  InvoicesStatistics,
  TotalBalanceStatistics,
  TransactionCategoriesStatistics,
  TransactionsStatistics,
  WalletsStatistics,
} from '../../(dashboard)/statistics';
import LoadingStatisticCard from '@/components/loading-statistic-card';
import { Suspense } from 'react';

interface Props {
  params: {
    wsId: string;
  };
}

export const dynamic = 'force-dynamic';

export default async function WorkspaceFinancePage({
  params: { wsId },
}: Props) {
  return (
    <div className="grid items-end gap-4 md:grid-cols-2 xl:grid-cols-4">
      <Suspense fallback={<LoadingStatisticCard className="md:col-span-2" />}>
        <TotalBalanceStatistics wsId={wsId} />
      </Suspense>

      <Suspense fallback={<LoadingStatisticCard />}>
        <IncomeStatistics wsId={wsId} />
      </Suspense>

      <Suspense fallback={<LoadingStatisticCard />}>
        <ExpenseStatistics wsId={wsId} />
      </Suspense>

      <Suspense fallback={<LoadingStatisticCard />}>
        <WalletsStatistics wsId={wsId} />
      </Suspense>

      <Suspense fallback={<LoadingStatisticCard />}>
        <TransactionCategoriesStatistics wsId={wsId} />
      </Suspense>

      <Suspense fallback={<LoadingStatisticCard />}>
        <TransactionsStatistics wsId={wsId} />
      </Suspense>

      <Suspense fallback={<LoadingStatisticCard />}>
        <InvoicesStatistics wsId={wsId} />
      </Suspense>
    </div>
  );
}
