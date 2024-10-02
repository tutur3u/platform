import {
  ExpenseStatistics,
  IncomeStatistics,
  InvoicesStatistics,
  TotalBalanceStatistics,
  TransactionCategoriesStatistics,
  TransactionsStatistics,
  WalletsStatistics,
} from '../../(dashboard)/statistics';
import { DailyTotalChart, MonthlyTotalChart } from './charts';
import { Filter } from './filter';
import LoadingStatisticCard from '@/components/loading-statistic-card';
import { createClient } from '@/utils/supabase/server';
import { Separator } from '@repo/ui/components/ui/separator';
import { Suspense } from 'react';

export interface FinanceDashboardSearchParams {
  view?: string;
  startDate?: string;
  endDate?: string;
}

interface Props {
  params: Promise<{
    wsId: string;
  }>;
  searchParams: Promise<FinanceDashboardSearchParams>;
}

export default async function WorkspaceFinancePage({
  params,
  searchParams,
}: Props) {
  const { wsId } = await params;
  const sp = await searchParams;
  const { data: dailyData } = await getDailyData(wsId);
  const { data: monthlyData } = await getMonthlyData(wsId);

  return (
    <>
      <Filter className="mb-4" />
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
          <WalletsStatistics wsId={wsId} />
        </Suspense>

        <Suspense fallback={<LoadingStatisticCard />}>
          <TransactionCategoriesStatistics wsId={wsId} />
        </Suspense>

        <Suspense fallback={<LoadingStatisticCard />}>
          <TransactionsStatistics wsId={wsId} searchParams={sp} />
        </Suspense>

        <Suspense fallback={<LoadingStatisticCard />}>
          <InvoicesStatistics wsId={wsId} searchParams={sp} />
        </Suspense>

        <Suspense fallback={<LoadingStatisticCard className="col-span-full" />}>
          <Separator className="col-span-full mb-4" />
          <DailyTotalChart data={dailyData} className="col-span-full" />
          <Separator className="col-span-full my-4" />
          <MonthlyTotalChart
            data={monthlyData}
            className="col-span-full mb-32"
          />
        </Suspense>
      </div>
    </>
  );
}

async function getDailyData(wsId: string) {
  const supabase = await createClient();

  const queryBuilder = supabase.rpc('get_daily_income_expense', {
    _ws_id: wsId,
  });

  const { data, error, count } = await queryBuilder;
  if (error) throw error;

  return { data, count };
}

async function getMonthlyData(wsId: string) {
  const supabase = await createClient();

  const queryBuilder = supabase.rpc('get_monthly_income_expense', {
    _ws_id: wsId,
  });

  const { data, error, count } = await queryBuilder;
  if (error) throw error;

  return { data, count };
}
