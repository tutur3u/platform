import { ReactElement, useEffect, useState } from 'react';
import HeaderX from '../../../../components/metadata/HeaderX';
import { PageWithLayoutProps } from '../../../../types/PageWithLayoutProps';
import { enforceHasWorkspaces } from '../../../../utils/serverless/enforce-has-workspaces';
import NestedLayout from '../../../../components/layouts/NestedLayout';
import { Divider, Switch } from '@mantine/core';
import { useLocalStorage } from '@mantine/hooks';
import { Transaction } from '../../../../types/primitives/Transaction';
import useSWR from 'swr';
import TransactionCard from '../../../../components/cards/TransactionCard';
import { useSegments } from '../../../../hooks/useSegments';
import { useWorkspaces } from '../../../../hooks/useWorkspaces';
import ModeSelector, {
  Mode,
} from '../../../../components/selectors/ModeSelector';
import PaginationSelector from '../../../../components/selectors/PaginationSelector';
import moment from 'moment';
import MiniPlusButton from '../../../../components/common/MiniPlusButton';
import 'moment/locale/vi';
import PlusCardButton from '../../../../components/common/PlusCardButton';
import GeneralSearchBar from '../../../../components/inputs/GeneralSearchBar';
import useTranslation from 'next-translate/useTranslation';
import DateRangeInput from '../../../../components/selectors/DateRangeInput';

export const getServerSideProps = enforceHasWorkspaces;

const FinanceTransactionsPage: PageWithLayoutProps = () => {
  const { setRootSegment } = useSegments();
  const { ws } = useWorkspaces();

  const { lang } = useTranslation();
  const { t } = useTranslation('transactions');

  const finance = t('finance');
  const transaction = t('transactions');
  const unnamedWorkspace = t('unnamed-ws');

  useEffect(() => {
    setRootSegment(
      ws
        ? [
            {
              content: ws?.name || unnamedWorkspace,
              href: `/${ws.id}`,
            },
            { content: finance, href: `/${ws.id}/finance` },
            {
              content: transaction,
              href: `/${ws.id}/finance/transactions`,
            },
          ]
        : []
    );

    return () => setRootSegment([]);
  }, [ws, setRootSegment, finance, transaction, unnamedWorkspace]);

  const [query, setQuery] = useState('');
  const [activePage, setPage] = useState(1);

  const [itemsPerPage, setItemsPerPage] = useLocalStorage({
    key: 'finance-transactions-items-per-page',
    defaultValue: 15,
  });

  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);

  const apiPath = ws?.id
    ? `/api/workspaces/${
        ws.id
      }/finance/transactions?query=${query}&page=${activePage}&itemsPerPage=${itemsPerPage}&startDate=${
        startDate?.toISOString() || ''
      }&endDate=${endDate?.toISOString() || ''}`
    : null;

  // const countApi = ws?.id
  //   ? `/api/workspaces/${ws.id}/finance/transactions/count`
  //   : null;

  const { data: transactions } = useSWR<Transaction[]>(apiPath);
  // const { data: count } = useSWR<number>(countApi);

  const [mode, setMode] = useLocalStorage<Mode>({
    key: 'finance-transactions-mode',
    defaultValue: 'grid',
  });

  const [showAmount, setShowAmount] = useLocalStorage({
    key: 'finance-transactions-showAmount',
    defaultValue: true,
  });

  const [showDatetime, setShowDatetime] = useLocalStorage({
    key: 'finance-transactions-showDatetime',
    defaultValue: true,
  });

  const [showWallet, setShowWallet] = useLocalStorage({
    key: 'finance-transactions-showWallet',
    defaultValue: true,
  });

  if (!ws) return null;

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
    <>
      <HeaderX label={`${t('transactions')} - ${t('finance')}`} />
      <div className="flex min-h-full w-full flex-col ">
        <div className="grid items-end gap-4 md:grid-cols-2 xl:grid-cols-4">
          <GeneralSearchBar setQuery={setQuery} />
          <ModeSelector mode={mode} setMode={setMode} />
          <DateRangeInput
            label={t('date-range')}
            placeholder={t('common:all')}
            setStartDate={setStartDate}
            setEndDate={setEndDate}
          />
          <PaginationSelector
            items={itemsPerPage}
            setItems={(size) => {
              setPage(1);
              setItemsPerPage(size);
            }}
          />

          <Divider variant="dashed" className="col-span-full" />
          <Switch
            label={t('show-amount')}
            checked={showAmount}
            onChange={(event) => setShowAmount(event.currentTarget.checked)}
          />
          <Switch
            label={t('show-datetime')}
            checked={showDatetime}
            onChange={(event) => setShowDatetime(event.currentTarget.checked)}
          />
          <Switch
            label={t('show-wallet')}
            checked={showWallet}
            onChange={(event) => setShowWallet(event.currentTarget.checked)}
          />
        </div>

        <Divider className="my-4" />

        <div
          className={`grid gap-x-4 gap-y-2 ${
            mode === 'grid' && 'md:grid-cols-2 xl:grid-cols-4'
          }`}
        >
          <h3 className="col-span-full text-lg font-semibold text-zinc-700 dark:text-zinc-300">
            {t('new-transaction')}
          </h3>
          <PlusCardButton href={`/${ws.id}/finance/transactions/new`} />
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
                      href={`/${ws.id}/finance/transactions/new?date=${date}`}
                      className="opacity-0 group-hover:opacity-100"
                    />
                  </div>

                  <div className="flex gap-2">
                    <div className="rounded bg-purple-500/10 px-2 py-0.5 text-base text-purple-600 dark:bg-purple-300/10 dark:text-purple-300">
                      {data.transactions.length}{' '}
                      {t('transactions').toLowerCase()}
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

                <Divider variant="dashed" className="mb-4 mt-2" />

                <div
                  className={`grid gap-4 ${
                    mode === 'grid' && 'lg:grid-cols-2 xl:grid-cols-3'
                  }`}
                >
                  {data.transactions.map((c) => (
                    <TransactionCard
                      key={c.id}
                      wsId={ws.id}
                      transaction={c}
                      showAmount={showAmount}
                      showDatetime={showDatetime}
                      showWallet={showWallet}
                    />
                  ))}
                </div>
              </div>
            ))}
        </div>
      </div>
    </>
  );
};

FinanceTransactionsPage.getLayout = function getLayout(page: ReactElement) {
  return <NestedLayout mode="finance">{page}</NestedLayout>;
};

export default FinanceTransactionsPage;
