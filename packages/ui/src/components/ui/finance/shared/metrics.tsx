'use client';

import LoadingStatisticCard from '@tuturuuu/ui/finance/shared/loaders/statistics';
import ExpenseStatistics from '@tuturuuu/ui/finance/statistics/expense';
import IncomeStatistics from '@tuturuuu/ui/finance/statistics/income';
import InvoicesStatistics from '@tuturuuu/ui/finance/statistics/invoices';
import TotalBalanceStatistics from '@tuturuuu/ui/finance/statistics/total-balance';
import TransactionCategoriesStatistics from '@tuturuuu/ui/finance/statistics/transaction-categories';
import TransactionsStatistics from '@tuturuuu/ui/finance/statistics/transactions';
import WalletsStatistics from '@tuturuuu/ui/finance/statistics/wallets';
import { Suspense } from 'react';

export interface FinanceDashboardSearchParams {
  showFinanceStats?: boolean;
  view?: string;
  startDate?: string;
  endDate?: string;
  includeConfidential?: string; // 'true' or 'false' from URL search params
}

export default function FinanceMetrics({
  wsId,
  currency = 'USD',
  searchParams: sp,
}: {
  wsId: string;
  currency?: string;
  searchParams: FinanceDashboardSearchParams;
}) {
  // const [showFinanceStats, setShowFinanceStats] = useState(false);

  return (
    <>
      {/* <FinanceToggle value={showFinanceStats} onChange={setShowFinanceStats} /> */}

      <Suspense fallback={<LoadingStatisticCard className="md:col-span-2" />}>
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
        <ExpenseStatistics wsId={wsId} currency={currency} searchParams={sp} />
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
