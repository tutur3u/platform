import { FinanceCategoryStatistics } from './categories/finance';
import FinanceToggle from './finance-toggle';
import LoadingStatisticCard from '@tuturuuu/ui/finance/shared/loaders/statistics';
import { FinanceDashboardSearchParams } from '@tuturuuu/ui/finance/shared/metrics';
import ExpenseStatistics from '@tuturuuu/ui/finance/statistics/expense';
import IncomeStatistics from '@tuturuuu/ui/finance/statistics/income';
import InvoicesStatistics from '@tuturuuu/ui/finance/statistics/invoices';
import TotalBalanceStatistics from '@tuturuuu/ui/finance/statistics/total-balance';
import TransactionCategoriesStatistics from '@tuturuuu/ui/finance/statistics/transaction-categories';
import TransactionsStatistics from '@tuturuuu/ui/finance/statistics/transactions';
import WalletsStatistics from '@tuturuuu/ui/finance/statistics/wallets';
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
