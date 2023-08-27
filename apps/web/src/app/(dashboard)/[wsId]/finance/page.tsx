'use client';

import { useState } from 'react';
import useSWR from 'swr';
import useTranslation from 'next-translate/useTranslation';
import { Divider } from '@mantine/core';
import moment from 'moment';
import TransactionCard from '@/components/cards/TransactionCard';
import StatisticCard from '@/components/cards/StatisticCard';
import DateRangePicker from '@/components/calendar/DateRangePicker';
import { Transaction } from '@/types/primitives/Transaction';
import { DateRange } from '@/utils/date-helper';
import { useWorkspaces } from '@/hooks/useWorkspaces';

export default function WorkspaceFinancePage() {
  const { t } = useTranslation('finance-overview');
  const { ws } = useWorkspaces();

  const [dateRange, setDateRange] = useState<DateRange>([null, null]);

  const startDate = dateRange?.[0]
    ? moment(dateRange[0]).format('YYYY-MM-DD')
    : '';

  const endDate = dateRange?.[1]
    ? moment(dateRange[1]).format('YYYY-MM-DD')
    : '';

  const dateRangeQuery = `?startDate=${startDate}&endDate=${endDate}`;

  const incomeApi = ws?.id
    ? `/api/workspaces/${ws.id}/finance/wallets/income${dateRangeQuery}`
    : null;

  const expenseApi = ws?.id
    ? `/api/workspaces/${ws.id}/finance/wallets/expense${dateRangeQuery}`
    : null;

  const walletsCountApi = ws?.id
    ? `/api/workspaces/${ws.id}/finance/wallets/count`
    : null;

  const categoriesCountApi = ws?.id
    ? `/api/workspaces/${ws.id}/finance/transactions/categories/count`
    : null;

  const transactionsCountApi = ws?.id
    ? `/api/workspaces/${ws.id}/finance/transactions/count${dateRangeQuery}`
    : null;

  const invoicesCountApi = ws?.id
    ? `/api/workspaces/${ws.id}/finance/invoices/count${dateRangeQuery}`
    : null;

  const { data: income, error: incomeError } = useSWR<number>(incomeApi);
  const { data: expense, error: expenseError } = useSWR<number>(expenseApi);

  const { data: walletsCount, error: walletsError } =
    useSWR<number>(walletsCountApi);

  const { data: categoriesCount, error: categoriesError } =
    useSWR<number>(categoriesCountApi);

  const { data: transactionsCount, error: transactionsError } =
    useSWR<number>(transactionsCountApi);

  const { data: invoicesCount, error: invoicesError } =
    useSWR<number>(invoicesCountApi);

  const isIncomeLoading = income === undefined && !incomeError;
  const isExpenseLoading = expense === undefined && !expenseError;
  const isWalletsCountLoading = walletsCount === undefined && !walletsError;
  const isCategoriesCountLoading =
    categoriesCount === undefined && !categoriesError;

  const isTransactionsCountLoading =
    transactionsCount === undefined && !transactionsError;

  const isInvoicesCountLoading = invoicesCount === undefined && !invoicesError;

  const walletsLabel = t('finance-tabs:wallets');
  const transactionsLabel = t('finance-tabs:transactions');
  const categoriesLabel = t('finance-tabs:transaction-categories');
  const invoicesLabel = t('finance-tabs:invoices');

  const totalBalance = t('total-balance');
  const totalIncome = t('total-income');
  const totalExpense = t('total-expense');
  const recentTransactions = t('recent-transactions');
  const noTransaction = t('no-transaction');

  const page = 1;
  const itemsPerPage = 16;

  const apiPath = ws?.id
    ? `/api/workspaces/${ws.id}/finance/transactions?page=${page}&itemsPerPage=${itemsPerPage}`
    : null;

  const { data: transactions } = useSWR<Transaction[]>(apiPath);

  const sum = (income || 0) + (expense || 0);

  return (
    <div className="flex min-h-full w-full flex-col ">
      <div className="grid items-end gap-4 md:grid-cols-2 xl:grid-cols-4">
        <DateRangePicker
          defaultUnit="month"
          defaultOption="present"
          value={dateRange}
          onChange={setDateRange}
        />
      </div>

      <Divider className="my-4" />
      <div className="grid items-end gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatisticCard
          title={totalBalance}
          color="blue"
          value={Intl.NumberFormat('vi-VN', {
            style: 'currency',
            currency: 'VND',
          }).format(sum || 0)}
          loading={isIncomeLoading || isExpenseLoading}
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
          loading={isIncomeLoading}
        />

        <StatisticCard
          title={totalExpense}
          color="red"
          value={Intl.NumberFormat('vi-VN', {
            style: 'currency',
            currency: 'VND',
            signDisplay: 'exceptZero',
          }).format(expense || 0)}
          loading={isExpenseLoading}
        />

        <StatisticCard
          title={walletsLabel}
          value={walletsCount}
          href={`/${ws?.id}/finance/wallets`}
          loading={isWalletsCountLoading}
        />

        <StatisticCard
          title={categoriesLabel}
          value={categoriesCount}
          href={`/${ws?.id}/finance/transactions/categories`}
          loading={isCategoriesCountLoading}
        />

        <StatisticCard
          title={transactionsLabel}
          value={transactionsCount}
          href={`/${ws?.id}/finance/transactions`}
          loading={isTransactionsCountLoading}
        />

        <StatisticCard
          title={invoicesLabel}
          value={invoicesCount}
          href={`/${ws?.id}/finance/invoices`}
          loading={isInvoicesCountLoading}
        />

        <div className="col-span-full">
          <Divider className="mb-4" />
          <div className="text-lg font-semibold md:text-2xl">
            {recentTransactions}
          </div>
        </div>

        {transactions && transactions.length > 0 ? (
          transactions.map((c) => (
            <TransactionCard
              key={c.id}
              wsId={ws?.id}
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
