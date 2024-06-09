'use client';

import MiniPlusButton from '../../../../../../../components/common/MiniPlusButton';
import { Transaction } from '@/types/primitives/Transaction';
import { Wallet } from '@/types/primitives/Wallet';
import { Divider } from '@mantine/core';
import moment from 'moment';
import useTranslation from 'next-translate/useTranslation';
import useSWR from 'swr';

interface Props {
  params: {
    wsId: string;
    walletId: string;
  };
}

export default function WalletDetailsPage({
  params: { wsId, walletId },
}: Props) {
  const { lang } = useTranslation();
  const { t } = useTranslation('wallet');

  const apiPath =
    wsId && walletId
      ? `/api/workspaces/${wsId}/finance/wallets/${walletId}`
      : null;

  const { data: wallet } = useSWR<Wallet>(apiPath);

  const activePage = 1;
  const itemsPerPage = 100;

  const transactionsApiPath = wsId
    ? `/api/workspaces/${wsId}/finance/transactions?walletIds=${walletId}&page=${activePage}&itemsPerPage=${itemsPerPage}`
    : null;

  // const countApi = wsId
  //   ? `/api/workspaces/${wsId}/finance/transactions/count`
  //   : null;

  const { data: transactions } = useSWR<Transaction[]>(transactionsApiPath);
  // const { data: count } = useSWR<number>(countApi);

  const transactionsByDate = transactions?.reduce(
    (acc, cur) => {
      const date = moment(cur.taken_at).toDate();
      const localeDate = date.toLocaleDateString();

      if (!acc[localeDate]) acc[localeDate] = { transactions: [], total: 0 };

      acc[localeDate].transactions.push(cur);

      acc[localeDate].total += cur?.amount || 0;

      return acc;
    },
    {} as Record<string, { transactions: Transaction[]; total: number }>
  );

  const getRelativeDate = (date: string) => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const dateObj = new Date(date);

    if (dateObj.toDateString() === today.toDateString()) return t('today');
    if (dateObj.toDateString() === yesterday.toDateString())
      return t('yesterday');
    if (dateObj.toDateString() === tomorrow.toDateString())
      return t('tomorrow');

    // Capitalize the first letter of the day
    return moment(date)
      .locale(lang)
      .format('dddd, DD/MM/YYYY')
      .replace(/(^\w)|(\s+\w)/g, (letter) => letter.toUpperCase());
  };

  return (
    <div className="mt-2 flex min-h-full w-full flex-col">
      <div className="grid h-fit gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div
          className={`rounded border border-orange-500/10 bg-orange-500/10 p-4 text-orange-600 dark:border-orange-300/10 dark:bg-orange-300/10 dark:text-orange-300 ${
            wallet?.type === 'STANDARD' ? 'md:col-span-2' : ''
          }`}
        >
          <div className="line-clamp-1 text-2xl font-semibold">
            {t('wallet-name')}
          </div>

          <div className="line-clamp-1 text-orange-600/70 dark:text-orange-300/70">
            {wallet?.name}
          </div>
        </div>

        {wallet?.type === 'CREDIT' && (
          <>
            <div className="rounded border border-purple-500/10 bg-purple-500/10 p-4 text-purple-600 dark:border-purple-300/10 dark:bg-purple-300/10 dark:text-purple-300">
              <div className="line-clamp-1 text-2xl font-semibold">
                {t('credit-limit')}
              </div>
              <div className="line-clamp-2 text-purple-600/70 dark:text-purple-300/70">
                {Intl.NumberFormat('vi-VN', {
                  style: 'currency',
                  currency: wallet?.currency || 'VND',
                }).format(wallet?.limit || 0)}
              </div>
            </div>
            <div className="rounded border border-red-500/10 bg-red-500/10 p-4 text-red-600 dark:border-red-300/10 dark:bg-red-300/10 dark:text-red-300">
              <div className="line-clamp-1 text-2xl font-semibold">
                {t('outstanding-balance')}
              </div>
              <div className="line-clamp-2 text-red-600/70 dark:text-red-300/70">
                {Intl.NumberFormat('vi-VN', {
                  style: 'currency',
                  currency: wallet?.currency || 'VND',
                }).format(
                  Math.max((wallet?.limit || 0) - (wallet?.balance || 0), 0)
                )}
              </div>
            </div>
          </>
        )}

        <div
          className={`rounded border border-green-500/10 bg-green-500/10 p-4 text-green-600 dark:border-green-300/10 dark:bg-green-300/10 dark:text-green-300 ${
            wallet?.type === 'STANDARD' ? 'md:col-span-2' : ''
          }`}
        >
          <div className="line-clamp-1 text-2xl font-semibold">
            {wallet?.type === 'STANDARD' ? t('balance') : t('available-credit')}
          </div>
          <div className="line-clamp-2 text-green-600/70 dark:text-green-300/70">
            {Intl.NumberFormat('vi-VN', {
              style: 'currency',
              currency: wallet?.currency || 'VND',
            }).format(wallet?.balance || 0)}
          </div>
        </div>

        {wallet?.statement_date && wallet?.payment_date ? (
          <div className="text-foreground/80 col-span-full dark:text-zinc-400">
            {t('statement-date-message')}{' '}
            <span className="font-semibold text-blue-500 underline decoration-blue-500 underline-offset-2 dark:text-blue-200 dark:decoration-blue-300">
              {wallet?.statement_date}
            </span>{' '}
            {t('payment-due-date-message')}{' '}
            <span className="font-semibold text-blue-500 underline decoration-blue-500 underline-offset-2 dark:text-blue-200 dark:decoration-blue-300">
              {wallet?.payment_date}
            </span>{' '}
            {t('next-month')}.
          </div>
        ) : null}
      </div>

      <Divider className="my-4" />

      <div className="mt-8 grid gap-8">
        {transactionsByDate &&
          Object.entries(transactionsByDate).length > 0 &&
          Object.entries(transactionsByDate).map(([date, data]) => (
            <div
              key={date}
              className="border-border group rounded-lg border bg-zinc-500/5 p-4 dark:border-zinc-300/10 dark:bg-zinc-900"
            >
              <h3 className="col-span-full flex w-full flex-col justify-between gap-x-4 gap-y-2 text-lg font-semibold text-zinc-700 md:flex-row dark:text-zinc-300">
                <div className="flex gap-2">
                  <div>{getRelativeDate(date)}</div>
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

              <Divider variant="dashed" className="mb-4 mt-2" />
            </div>
          ))}
      </div>
    </div>
  );
}
