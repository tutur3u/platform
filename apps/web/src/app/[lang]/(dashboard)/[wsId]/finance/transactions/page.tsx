import { DailyTotalChart, MonthlyTotalChart } from './charts';
import TransactionsTable from './table';
import { Separator } from '@/components/ui/separator';
import { Transaction } from '@/types/primitives/Transaction';
import { Database } from '@/types/supabase';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

interface Props {
  params: {
    wsId: string;
  };
  searchParams: {
    q: string;
    page: string;
    pageSize: string;
  };
}

export default async function WorkspaceTransactionsPage({
  params: { wsId },
  searchParams,
}: Props) {
  const { data, count } = await getData(wsId, searchParams);

  const { data: dailyData } = await getDailyData(wsId);
  const { data: monthlyData } = await getMonthlyData(wsId);

  return (
    <>
      <DailyTotalChart data={dailyData} />
      <Separator className="my-4" />
      <MonthlyTotalChart data={monthlyData} />
      <Separator className="my-4" />
      <TransactionsTable
        wsId={wsId}
        data={data.map((t) => ({
          ...t,
          ws_id: wsId,
        }))}
        count={count}
      />
    </>
  );
}

async function getData(
  wsId: string,
  {
    q,
    page = '1',
    pageSize = '10',
  }: { q?: string; page?: string; pageSize?: string }
) {
  const supabase = createServerComponentClient<Database>({ cookies });

  const queryBuilder = supabase
    .from('wallet_transactions')
    .select(
      '*, workspace_wallets!inner(name, ws_id), transaction_categories(name)',
      {
        count: 'exact',
      }
    )
    .eq('workspace_wallets.ws_id', wsId)
    .order('created_at', { ascending: false });

  if (q) queryBuilder.ilike('name', `%${q}%`);

  if (page && pageSize) {
    const parsedPage = parseInt(page);
    const parsedSize = parseInt(pageSize);
    const start = (parsedPage - 1) * parsedSize;
    const end = parsedPage * parsedSize;
    queryBuilder.range(start, end).limit(parsedSize);
  }

  const { data: rawData, error, count } = await queryBuilder;
  if (error) throw error;

  const data = rawData.map(
    ({ workspace_wallets, transaction_categories, ...rest }) => ({
      ...rest,
      wallet: workspace_wallets?.name,
      category: transaction_categories?.name,
    })
  );

  return { data, count } as {
    data: Transaction[];
    count: number;
  };
}

async function getDailyData(wsId: string) {
  const supabase = createServerComponentClient<Database>({ cookies });

  const queryBuilder = supabase.rpc('get_daily_income_expense', {
    _ws_id: wsId,
  });

  const { data, error, count } = await queryBuilder;
  if (error) throw error;

  return { data, count };
}

async function getMonthlyData(wsId: string) {
  const supabase = createServerComponentClient<Database>({ cookies });

  const queryBuilder = supabase.rpc('get_monthly_income_expense', {
    _ws_id: wsId,
  });

  const { data, error, count } = await queryBuilder;
  if (error) throw error;

  return { data, count };
}
