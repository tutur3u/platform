import { ReactElement, useEffect, useState } from 'react';
import { useSegments } from '../../../hooks/useSegments';
import { PageWithLayoutProps } from '../../../types/PageWithLayoutProps';
import NestedLayout from '../../../components/layouts/NestedLayout';
import { enforceHasWorkspaces } from '../../../utils/serverless/enforce-has-workspaces';
import HeaderX from '../../../components/metadata/HeaderX';
import { useWorkspaces } from '../../../hooks/useWorkspaces';
import useSWR from 'swr';
import useTranslation from 'next-translate/useTranslation';
import StatisticCard from '../../../components/cards/StatisticCard';
import { Divider } from '@mantine/core';
import { Transaction } from '../../../types/primitives/Transaction';
import TransactionCard from '../../../components/cards/TransactionCard';
import DateRangePicker from '../../../components/calendar/DateRangePicker';
import { DateRange } from '../../../utils/date-helper';
import moment from 'moment';

export const getServerSideProps = enforceHasWorkspaces;

const FinancePage: PageWithLayoutProps = () => {
  const { setRootSegment } = useSegments();
  const { ws } = useWorkspaces();

  useEffect(() => {
    setRootSegment(
      ws
        ? [
            {
              content: ws?.name || 'Tổ chức không tên',
              href: `/${ws.id}`,
            },
            { content: 'Tài chính', href: `/${ws.id}/finance` },
            { content: 'Tổng quan', href: `/${ws.id}/finance` },
          ]
        : []
    );

    return () => setRootSegment([]);
  }, [ws, setRootSegment]);

  const [dateRange, setDateRange] = useState<DateRange>([null, null]);

  const startDate = dateRange?.[0]
    ? moment(dateRange[0]).format('YYYY-MM-DD')
    : '';

  const endDate = dateRange?.[1]
    ? moment(dateRange[1]).format('YYYY-MM-DD')
    : '';

  const dateRangeQuery = `?startDate=${startDate}&endDate=${endDate}`;

  const sumApi = ws?.id ? `/api/workspaces/${ws.id}/finance/wallets/sum` : null;

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

  const { data: sum } = useSWR<number>(sumApi);
  const { data: income } = useSWR<number>(incomeApi);
  const { data: expense } = useSWR<number>(expenseApi);
  const { data: walletsCount } = useSWR<number>(walletsCountApi);
  const { data: categoriesCount } = useSWR<number>(categoriesCountApi);
  const { data: transactionsCount } = useSWR<number>(transactionsCountApi);
  const { data: invoicesCount } = useSWR<number>(invoicesCountApi);

  const { t } = useTranslation('finance-tabs');

  const walletsLabel = t('wallets');
  const transactionsLabel = t('transactions');
  const categoriesLabel = t('transaction-categories');
  const invoicesLabel = t('invoices');

  const page = 1;
  const itemsPerPage = 16;

  const apiPath = ws?.id
    ? `/api/workspaces/${ws.id}/finance/transactions?page=${page}&itemsPerPage=${itemsPerPage}`
    : null;

  const { data: transactions } = useSWR<Transaction[]>(apiPath);

  if (!ws) return null;

  return (
    <>
      <HeaderX label="Tổng quan – Tài chính" />
      <div className="flex min-h-full w-full flex-col pb-20">
        <div className="mt-2 grid items-end gap-4 md:grid-cols-2 xl:grid-cols-4">
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
            title="Tổng tiền"
            color="blue"
            value={Intl.NumberFormat('vi-VN', {
              style: 'currency',
              currency: 'VND',
            }).format(sum || 0)}
            className="md:col-span-2"
          />

          <StatisticCard
            title="Tổng thu"
            color="green"
            value={Intl.NumberFormat('vi-VN', {
              style: 'currency',
              currency: 'VND',
              signDisplay: 'exceptZero',
            }).format(income || 0)}
          />

          <StatisticCard
            title="Tổng chi"
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
            href={`/${ws?.id}/finance/wallets`}
          />

          <StatisticCard
            title={categoriesLabel}
            value={categoriesCount}
            href={`/${ws?.id}/finance/transactions/categories`}
          />

          <StatisticCard
            title={transactionsLabel}
            value={transactionsCount}
            href={`/${ws?.id}/finance/transactions`}
          />

          <StatisticCard
            title={invoicesLabel}
            value={invoicesCount}
            href={`/${ws?.id}/finance/invoices`}
          />

          <div className="col-span-full">
            <Divider className="mb-4" />
            <div className="text-lg font-semibold md:text-2xl">
              Giao dịch gần đây
            </div>
          </div>

          {transactions && transactions.length > 0 ? (
            transactions.map((c) => (
              <TransactionCard
                key={c.id}
                wsId={ws.id}
                transaction={c}
                showAmount
                showDatetime
              />
            ))
          ) : (
            <div className="col-span-full -mt-2 text-zinc-400">
              Chưa có giao dịch nào
            </div>
          )}
        </div>
      </div>
    </>
  );
};

FinancePage.getLayout = function getLayout(page: ReactElement) {
  return <NestedLayout mode="finance">{page}</NestedLayout>;
};

export default FinancePage;
