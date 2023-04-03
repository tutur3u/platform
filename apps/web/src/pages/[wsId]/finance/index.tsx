import { ReactElement, useEffect } from 'react';
import { useSegments } from '../../../hooks/useSegments';
import { PageWithLayoutProps } from '../../../types/PageWithLayoutProps';
import NestedLayout from '../../../components/layouts/NestedLayout';
import { enforceHasWorkspaces } from '../../../utils/serverless/enforce-has-workspaces';
import HeaderX from '../../../components/metadata/HeaderX';
import { useWorkspaces } from '../../../hooks/useWorkspaces';
import useSWR from 'swr';
import useTranslation from 'next-translate/useTranslation';
import Link from 'next/link';

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

  const walletsCountApi = ws?.id
    ? `/api/workspaces/${ws.id}/finance/wallets/count`
    : null;

  const transactionsCountApi = ws?.id
    ? `/api/workspaces/${ws.id}/finance/transactions/count`
    : null;

  const categoriesCountApi = ws?.id
    ? `/api/workspaces/${ws.id}/finance/transactions/categories/count`
    : null;

  const { data: sum } = useSWR<number>(sumApi);
  const { data: walletsCount } = useSWR<number>(walletsCountApi);
  const { data: transactionsCount } = useSWR<number>(transactionsCountApi);
  const { data: categoriesCount } = useSWR<number>(categoriesCountApi);

  const { t } = useTranslation('finance-tabs');

  const walletsLabel = t('wallets');
  const transactionsLabel = t('transactions');
  const transactionCategoriesLabel = t('transaction-categories');

  return (
    <>
      <HeaderX label="Tổng quan – Tài chính" />
      <div className="flex min-h-full w-full flex-col pb-8">
        <div className="mt-2 grid items-end gap-4 md:grid-cols-2 xl:grid-cols-4">
          <button className="rounded border border-green-300/10 bg-green-300/10 transition duration-300 hover:-translate-y-1 hover:bg-green-300/20">
            <div className="p-2 text-center text-lg font-semibold text-green-300">
              Tổng tiền
            </div>
            <div className="m-2 mt-0 flex items-center justify-center rounded border border-green-300/20 bg-green-200/10 p-4 text-2xl font-semibold text-green-300">
              {Intl.NumberFormat('vi-VN', {
                style: 'currency',
                currency: 'VND',
              }).format(sum || 0)}
            </div>
          </button>

          <Link
            href={`/${ws?.id}/finance/wallets`}
            className="rounded border border-purple-300/10 bg-purple-300/10 transition duration-300 hover:-translate-y-1 hover:bg-purple-300/20"
          >
            <div className="p-2 text-center text-lg font-semibold text-purple-300">
              {walletsLabel}
            </div>
            <div className="m-2 mt-0 flex items-center justify-center rounded border border-purple-300/20 bg-purple-300/10 p-4 text-2xl font-semibold text-purple-300">
              {walletsCount}
            </div>
          </Link>

          <Link
            href={`/${ws?.id}/finance/transactions`}
            className="rounded border border-blue-300/10 bg-blue-300/10 transition duration-300 hover:-translate-y-1 hover:bg-blue-300/20"
          >
            <div className="p-2 text-center text-lg font-semibold text-blue-300">
              {transactionsLabel}
            </div>
            <div className="m-2 mt-0 flex items-center justify-center rounded border border-blue-300/20 bg-blue-300/10 p-4 text-2xl font-semibold text-blue-300">
              {transactionsCount}
            </div>
          </Link>

          <Link
            href={`/${ws?.id}/finance/transactions/categories`}
            className="rounded border border-orange-300/10 bg-orange-300/10 transition duration-300 hover:-translate-y-1 hover:bg-orange-300/20"
          >
            <div className="p-2 text-center text-lg font-semibold text-orange-300">
              {transactionCategoriesLabel}
            </div>
            <div className="m-2 mt-0 flex items-center justify-center rounded border border-orange-300/20 bg-orange-300/10 p-4 text-2xl font-semibold text-orange-300">
              {categoriesCount}
            </div>
          </Link>
        </div>
      </div>
    </>
  );
};

FinancePage.getLayout = function getLayout(page: ReactElement) {
  return <NestedLayout mode="finance">{page}</NestedLayout>;
};

export default FinancePage;
