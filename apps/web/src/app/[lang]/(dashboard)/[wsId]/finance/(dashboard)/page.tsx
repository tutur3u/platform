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
  // const [dateRange, setDateRange] = useState<DateRange>([null, null]);

  // const startDate = dateRange?.[0]?.toISOString() ?? null;
  // const endDate = dateRange?.[1]?.toISOString() ?? null;

  return (
    <div className="flex min-h-full w-full flex-col">
      {/* <div className="grid items-end gap-4 md:grid-cols-2 xl:grid-cols-4">
        <DateRangePicker
          defaultUnit="month"
          defaultOption="present"
          value={dateRange}
          onChange={setDateRange}
        />
      </div>

      <Divider className="my-4" /> */}
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
    </div>
  );
}
