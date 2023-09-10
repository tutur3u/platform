import moment from 'moment';
import 'moment/locale/vi';
import useTranslation from 'next-translate/useTranslation';
import { Separator } from '@/components/ui/separator';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { Database } from '@/types/supabase';
import { cookies } from 'next/headers';
import GeneralSearchBar from '@/components/inputs/GeneralSearchBar';
import DateRangeInput from '@/components/selectors/DateRangeInput';
import PlusCardButton from '@/components/common/PlusCardButton';
import MiniPlusButton from '@/components/common/MiniPlusButton';
import TransactionCard from '@/components/cards/TransactionCard';
import { Transaction } from '@/types/primitives/Transaction';

interface Props {
  params: {
    wsId: string;
  };
  searchParams: {
    q: string;
    from: string;
    to: string;
  };
}

export default async function FinanceTransactionsPage({
  params: { wsId },
  searchParams,
}: Props) {
  const { lang } = useTranslation();
  const { t } = useTranslation('transactions');

  const transactions = await getTransactions(wsId, searchParams);

  const transactionsByDate = transactions?.reduce(
    (acc, cur) => {
      const date = moment(cur.taken_at).toDate();
      const localeDate = date.toLocaleDateString();

      if (!acc[localeDate])
        acc[localeDate] = { transactions: [], total: 0, date };

      acc[localeDate].transactions.push(cur);

      acc[localeDate].total += cur?.amount || 0;

      return acc;
    },
    {} as Record<
      string,
      { transactions: Transaction[]; total: number; date: Date }
    >
  );

  const getRelativeDate = (date: Date) => {
    const dateStr = date.toDateString();

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayStr = today.toDateString();

    if (dateStr === todayStr) return t('today');

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toDateString();

    if (dateStr === yesterdayStr) return t('yesterday');

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toDateString();

    if (dateStr === tomorrowStr) return t('tomorrow');

    return (
      moment(date)
        .locale(lang)
        // Format the date to a string
        .format('dddd, DD/MM/YYYY')
        // Capitalize the first letter of the day
        .replace(/(^\w{1})|(\s+\w{1})/g, (letter) => letter.toUpperCase())
    );
  };

  return (
    <div className="flex min-h-full w-full flex-col ">
      <div className="grid items-end gap-4 md:grid-cols-2 xl:grid-cols-4">
        <GeneralSearchBar />
        <DateRangeInput label={t('date-range')} placeholder={t('common:all')} />
      </div>

      <Separator className="my-4" />

      <div className="grid gap-x-4 gap-y-2 md:grid-cols-2 xl:grid-cols-4">
        <h3 className="col-span-full text-lg font-semibold text-zinc-700 dark:text-zinc-300">
          {t('new-transaction')}
        </h3>
        <PlusCardButton href={`/${wsId}/finance/transactions/new`} />
      </div>

      <div className="mt-8 grid gap-8">
        {transactionsByDate &&
          Object.entries(transactionsByDate).length > 0 &&
          Object.entries(transactionsByDate).map(([date, data]) => (
            <div
              key={date}
              className="group rounded-lg border border-zinc-300 bg-zinc-500/5 p-4 dark:border-zinc-300/10 dark:bg-zinc-900"
            >
              <h3 className="col-span-full flex w-full flex-col justify-between gap-x-4 gap-y-2 text-lg font-semibold text-zinc-700 dark:text-zinc-300 md:flex-row">
                <div className="flex gap-2">
                  <div>{getRelativeDate(data.date)}</div>
                  <MiniPlusButton
                    href={`/${wsId}/finance/transactions/new?date=${date}`}
                    className="opacity-0 group-hover:opacity-100"
                  />
                </div>

                <div className="flex gap-2">
                  <div className="rounded bg-purple-500/10 px-2 py-0.5 text-base text-purple-600 dark:bg-purple-300/10 dark:text-purple-300">
                    {data.transactions.length} {t('transactions').toLowerCase()}
                  </div>
                  <div
                    className={`rounded px-2 py-0.5 text-base ${
                      data.total < 0
                        ? 'bg-red-500/10 text-red-600 dark:bg-red-300/10 dark:text-red-300'
                        : 'bg-green-500/10 text-green-600 dark:bg-green-300/10 dark:text-green-300'
                    }`}
                  >
                    {Intl.NumberFormat('vi-VN', {
                      style: 'currency',
                      currency: 'VND',
                      signDisplay: 'exceptZero',
                    }).format(data.total)}
                  </div>
                </div>
              </h3>

              <Separator className="mb-4 mt-2" />

              <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
                {data.transactions.map((c) => (
                  <TransactionCard
                    key={c.id}
                    wsId={wsId}
                    transaction={c}
                    showAmount={true}
                    showDatetime={true}
                    showWallet={true}
                  />
                ))}
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}

async function getTransactions(
  wsId: string,
  { q, from, to }: { q: string; from: string; to: string }
) {
  const supabase = createServerComponentClient<Database>({ cookies });

  const queryBuilder = supabase
    .from('wallet_transactions')
    .select('*, workspace_wallets!inner(ws_id)')
    .eq('workspace_wallets.ws_id', wsId);

  if (q) queryBuilder.ilike('name', `%${q}%`);
  if (from) queryBuilder.gte('taken_at', from);
  if (to) queryBuilder.lte('taken_at', to);

  const { data } = await queryBuilder;
  return data as Transaction[];
}
