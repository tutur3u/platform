import useTranslation from 'next-translate/useTranslation';
import TransactionCard from '@/components/cards/TransactionCard';
import StatisticCard from '@/components/cards/StatisticCard';
import { Transaction } from '@/types/primitives/Transaction';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { Separator } from '@/components/ui/separator';

export const dynamic = 'force-dynamic';

interface Props {
  params: {
    wsId: string;
  };
}

export default async function WorkspaceFinancePage({
  params: { wsId },
}: Props) {
  const supabase = createServerComponentClient({ cookies });

  const { t } = useTranslation('finance-overview');

  // const [dateRange, setDateRange] = useState<DateRange>([null, null]);

  // const startDate = dateRange?.[0]?.toISOString() ?? null;
  // const endDate = dateRange?.[1]?.toISOString() ?? null;

  const walletsLabel = t('finance-tabs:wallets');
  const transactionsLabel = t('finance-tabs:transactions');
  const categoriesLabel = t('finance-tabs:transaction-categories');
  const invoicesLabel = t('finance-tabs:invoices');

  const totalBalance = t('total-balance');
  const totalIncome = t('total-income');
  const totalExpense = t('total-expense');
  const recentTransactions = t('recent-transactions');
  const noTransaction = t('no-transaction');

  const { data: income } = await supabase.rpc('get_workspace_wallets_income', {
    ws_id: wsId,
    start_date: null,
    end_date: null,
    // start_date: startDate,
    // end_date: endDate,
  });

  const { data: expense } = await supabase.rpc(
    'get_workspace_wallets_expense',
    {
      ws_id: wsId,
      start_date: null,
      end_date: null,
      // start_date: startDate,
      // end_date: endDate,
    }
  );

  const { count: walletsCount } = await supabase
    .from('workspace_wallets')
    .select('*', {
      count: 'exact',
      head: true,
    })
    .eq('ws_id', wsId);

  const { count: categoriesCount } = await supabase
    .from('transaction_categories')
    .select('*', {
      count: 'exact',
      head: true,
    })
    .eq('ws_id', wsId);

  const { count: transactionsCount } = await supabase
    .from('wallet_transactions')
    .select('*, workspace_wallets!inner(ws_id)', {
      count: 'exact',
      head: true,
    })
    .eq('workspace_wallets.ws_id', wsId);

  const { count: invoicesCount } = await supabase
    .from('finance_invoices')
    .select('*', {
      count: 'exact',
      head: true,
    })
    .eq('ws_id', wsId);

  const sum = (income || 0) + (expense || 0);

  const { data: transactions } = await supabase
    .from('wallet_transactions')
    .select(
      'id, description, amount, category_id, wallet_id, taken_at, created_at, transaction_categories(name), workspace_wallets!inner(ws_id)'
    )
    .order('taken_at', { ascending: false })
    .eq('workspace_wallets.ws_id', wsId);

  return (
    <div className="flex min-h-full w-full flex-col ">
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
        <StatisticCard
          title={totalBalance}
          color="blue"
          value={Intl.NumberFormat('vi-VN', {
            style: 'currency',
            currency: 'VND',
          }).format(sum || 0)}
          className="md:col-span-2"
        />

        <StatisticCard
          title={totalIncome}
          color="green"
          value={Intl.NumberFormat('vi-VN', {
            style: 'currency',
            currency: 'VND',
            signDisplay: 'exceptZero',
          }).format(income || 0)}
        />

        <StatisticCard
          title={totalExpense}
          color="red"
          value={Intl.NumberFormat('vi-VN', {
            style: 'currency',
            currency: 'VND',
            signDisplay: 'exceptZero',
          }).format(expense || 0)}
        />

        <StatisticCard
          title={walletsLabel}
          value={walletsCount}
          href={`/${wsId}/finance/wallets`}
        />

        <StatisticCard
          title={categoriesLabel}
          value={categoriesCount}
          href={`/${wsId}/finance/transactions/categories`}
        />

        <StatisticCard
          title={transactionsLabel}
          value={transactionsCount}
          href={`/${wsId}/finance/transactions`}
        />

        <StatisticCard
          title={invoicesLabel}
          value={invoicesCount}
          href={`/${wsId}/finance/invoices`}
        />

        <div className="col-span-full">
          <Separator className="mb-4" />
          <div className="text-lg font-semibold md:text-2xl">
            {recentTransactions}
          </div>
        </div>

        {transactions && transactions.length > 0 ? (
          transactions.map((c: Transaction) => (
            <TransactionCard
              key={c.id}
              wsId={wsId}
              transaction={c}
              showAmount
              showDatetime
            />
          ))
        ) : (
          <div className="col-span-full -mt-2 text-zinc-400">
            {noTransaction}
          </div>
        )}
      </div>
    </div>
  );
}
