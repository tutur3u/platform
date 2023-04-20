import { ReactElement, useEffect } from 'react';
import { useSegments } from '../../../hooks/useSegments';
import { PageWithLayoutProps } from '../../../types/PageWithLayoutProps';
import NestedLayout from '../../../components/layouts/NestedLayout';
import { enforceHasWorkspaces } from '../../../utils/serverless/enforce-has-workspaces';
import HeaderX from '../../../components/metadata/HeaderX';
import { useWorkspaces } from '../../../hooks/useWorkspaces';
import useSWR from 'swr';
import useTranslation from 'next-translate/useTranslation';
import StatisticCard from '../../../components/cards/StatisticCard';

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

  const sumApi = ws?.id ? `/api/workspaces/${ws.id}/finance/wallets/sum` : null;

  const incomeApi = ws?.id
    ? `/api/workspaces/${ws.id}/finance/wallets/income`
    : null;

  const expenseApi = ws?.id
    ? `/api/workspaces/${ws.id}/finance/wallets/expense`
    : null;

  const walletsCountApi = ws?.id
    ? `/api/workspaces/${ws.id}/finance/wallets/count`
    : null;

  const transactionsCountApi = ws?.id
    ? `/api/workspaces/${ws.id}/finance/transactions/count`
    : null;

  const categoriesCountApi = ws?.id
    ? `/api/workspaces/${ws.id}/finance/transactions/categories/count`
    : null;

  const invoicesCountApi = ws?.id
    ? `/api/workspaces/${ws.id}/finance/invoices/count`
    : null;

  const { data: sum } = useSWR<number>(sumApi);
  const { data: income } = useSWR<number>(incomeApi);
  const { data: expense } = useSWR<number>(expenseApi);
  const { data: walletsCount } = useSWR<number>(walletsCountApi);
  const { data: transactionsCount } = useSWR<number>(transactionsCountApi);
  const { data: categoriesCount } = useSWR<number>(categoriesCountApi);
  const { data: invoicesCount } = useSWR<number>(invoicesCountApi);

  const { t } = useTranslation('finance-tabs');

  const walletsLabel = t('wallets');
  const transactionsLabel = t('transactions');
  const categoriesLabel = t('transaction-categories');
  const invoicesLabel = t('invoices');

  return (
    <>
      <HeaderX label="Tổng quan – Tài chính" />
      <div className="flex min-h-full w-full flex-col pb-8">
        <div className="mt-2 grid items-end gap-4 md:grid-cols-2 xl:grid-cols-4">
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
            title={transactionsLabel}
            value={transactionsCount}
            href={`/${ws?.id}/finance/transactions`}
          />

          <StatisticCard
            title={categoriesLabel}
            value={categoriesCount}
            href={`/${ws?.id}/finance/transactions/categories`}
          />

          <StatisticCard
            title={invoicesLabel}
            value={invoicesCount}
            href={`/${ws?.id}/finance/invoices`}
          />
        </div>
      </div>
    </>
  );
};

FinancePage.getLayout = function getLayout(page: ReactElement) {
  return <NestedLayout mode="finance">{page}</NestedLayout>;
};

export default FinancePage;
