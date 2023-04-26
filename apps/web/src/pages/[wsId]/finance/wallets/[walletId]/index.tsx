import { ReactElement, useEffect } from 'react';
import HeaderX from '../../../../../components/metadata/HeaderX';
import { PageWithLayoutProps } from '../../../../../types/PageWithLayoutProps';
import { enforceHasWorkspaces } from '../../../../../utils/serverless/enforce-has-workspaces';
import NestedLayout from '../../../../../components/layouts/NestedLayout';
import { Divider } from '@mantine/core';
import { useSegments } from '../../../../../hooks/useSegments';
import { useWorkspaces } from '../../../../../hooks/useWorkspaces';
import { useRouter } from 'next/router';
import { Wallet } from '../../../../../types/primitives/Wallet';
import useSWR from 'swr';
import TransactionCard from '../../../../../components/cards/TransactionCard';
import MiniPlusButton from '../../../../../components/common/MiniPlusButton';
import PlusCardButton from '../../../../../components/common/PlusCardButton';
import { Mode } from '../../../../../components/selectors/ModeSelector';
import { Transaction } from '../../../../../types/primitives/Transaction';
import moment from 'moment';
import { useLocalStorage } from '@mantine/hooks';

export const getServerSideProps = enforceHasWorkspaces;

const WalletDetailsPage: PageWithLayoutProps = () => {
  const { setRootSegment } = useSegments();
  const { ws } = useWorkspaces();

  const router = useRouter();
  const { wsId, walletId } = router.query;

  const apiPath =
    wsId && walletId
      ? `/api/workspaces/${wsId}/finance/wallets/${walletId}`
      : null;

  const { data: wallet } = useSWR<Wallet>(apiPath);

  useEffect(() => {
    setRootSegment(
      ws && wallet
        ? [
            {
              content: ws?.name || 'Tổ chức không tên',
              href: `/${wsId}`,
            },
            { content: 'Tài chính', href: `/${wsId}/finance` },
            {
              content: 'Nguồn tiền',
              href: `/${wsId}/finance/wallets`,
            },
            {
              content: wallet?.name || 'Nguồn tiền không tên',
              href: `/${wsId}/finance/wallets/${walletId}`,
            },
            {
              content: 'Thông tin',
              href: `/${wsId}/finance/wallets/${walletId}`,
            },
          ]
        : []
    );

    return () => setRootSegment([]);
  }, [wsId, walletId, ws, wallet, setRootSegment]);

  const activePage = 1;
  const itemsPerPage = 100;

  const transactionsApiPath = ws?.id
    ? `/api/workspaces/${ws.id}/finance/transactions?walletIds=${walletId}&page=${activePage}&itemsPerPage=${itemsPerPage}`
    : null;

  // const countApi = ws?.id
  //   ? `/api/workspaces/${ws.id}/finance/transactions/count`
  //   : null;

  const { data: transactions } = useSWR<Transaction[]>(transactionsApiPath);
  // const { data: count } = useSWR<number>(countApi);

  const [mode] = useLocalStorage<Mode>({
    key: 'finance-wallet-transactions-mode',
    defaultValue: 'grid',
  });

  if (!ws) return null;

  const transactionsByDate = transactions?.reduce((acc, cur) => {
    const date = moment(cur.taken_at).toDate();
    const localeDate = date.toLocaleDateString();

    if (!acc[localeDate]) acc[localeDate] = { transactions: [], total: 0 };

    acc[localeDate].transactions.push(cur);

    acc[localeDate].total += cur?.amount || 0;

    return acc;
  }, {} as Record<string, { transactions: Transaction[]; total: number }>);

  const getRelativeDate = (date: string) => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const dateObj = new Date(date);

    if (dateObj.toDateString() === today.toDateString()) return 'Hôm nay';
    if (dateObj.toDateString() === yesterday.toDateString()) return 'Hôm qua';
    if (dateObj.toDateString() === tomorrow.toDateString()) return 'Ngày mai';

    // Capitalize the first letter of the day
    return moment(date)
      .format('dddd, DD/MM/YYYY')
      .replace(/(^\w{1})|(\s+\w{1})/g, (letter) => letter.toUpperCase());
  };

  return (
    <>
      <HeaderX label="Nguồn tiền – Tài chính" />
      <div className="mt-2 flex min-h-full w-full flex-col pb-20">
        <div className="grid h-fit gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div
            className={`rounded border border-orange-300/10 bg-orange-300/10 p-4 text-orange-300 ${
              wallet?.type === 'STANDARD' ? 'md:col-span-2' : ''
            }`}
          >
            <div className="line-clamp-1 text-2xl font-semibold">
              Tên nguồn tiền
            </div>

            <div className="line-clamp-1 text-orange-300/70">
              {wallet?.name}
            </div>
          </div>

          {wallet?.type === 'CREDIT' && (
            <>
              <div className="rounded border border-purple-300/10 bg-purple-300/10 p-4 text-purple-300">
                <div className="line-clamp-1 text-2xl font-semibold">
                  Hạn mức
                </div>
                <div className="line-clamp-2 text-purple-300/70">
                  {Intl.NumberFormat('vi-VN', {
                    style: 'currency',
                    currency: wallet?.currency || 'VND',
                  }).format(wallet?.limit || 0)}
                </div>
              </div>
              <div className="rounded border border-red-300/10 bg-red-300/10 p-4 text-red-300">
                <div className="line-clamp-1 text-2xl font-semibold">
                  Dư nợ hiện tại
                </div>
                <div className="line-clamp-2 text-red-300/70">
                  {Intl.NumberFormat('vi-VN', {
                    style: 'currency',
                    currency: wallet?.currency || 'VND',
                  }).format((wallet?.limit || 0) - (wallet?.balance || 0))}
                </div>
              </div>
            </>
          )}

          <div
            className={`rounded border border-green-300/10 bg-green-300/10 p-4 text-green-300 ${
              wallet?.type === 'STANDARD' ? 'md:col-span-2' : ''
            }`}
          >
            <div className="line-clamp-1 text-2xl font-semibold">
              {wallet?.type === 'STANDARD'
                ? 'Số tiền hiện có'
                : 'Số tiền khả dụng'}
            </div>
            <div className="line-clamp-2 text-green-300/70">
              {Intl.NumberFormat('vi-VN', {
                style: 'currency',
                currency: wallet?.currency || 'VND',
              }).format(wallet?.balance || 0)}
            </div>
          </div>

          {wallet?.statement_date && wallet?.payment_date ? (
            <div className="col-span-full text-zinc-400">
              Nguồn tiền này sẽ được lên sao kê vào{' '}
              <span className="font-semibold text-blue-200 underline decoration-blue-300 underline-offset-2">
                ngày {wallet?.statement_date}
              </span>{' '}
              hàng tháng và hạn thanh toán vào{' '}
              <span className="font-semibold text-blue-200 underline decoration-blue-300 underline-offset-2">
                ngày {wallet?.payment_date}
              </span>{' '}
              của tháng sau.
            </div>
          ) : null}
        </div>

        <Divider className="my-4" />

        <div
          className={`grid gap-x-4 gap-y-2 ${
            mode === 'grid' && 'md:grid-cols-2 xl:grid-cols-4'
          }`}
        >
          <h3 className="col-span-full text-lg font-semibold text-gray-300">
            Giao dịch mới
          </h3>
          <PlusCardButton
            href={`/${ws.id}/finance/transactions/new?walletId=${walletId}`}
          />
        </div>

        <div className="mt-8 grid gap-8">
          {transactionsByDate &&
            Object.entries(transactionsByDate).length > 0 &&
            Object.entries(transactionsByDate).map(([date, data]) => (
              <div
                key={date}
                className="group rounded-lg border border-zinc-300/10 bg-zinc-900 p-4"
              >
                <h3 className="col-span-full flex w-full flex-col justify-between gap-x-4 gap-y-2 text-lg font-semibold text-gray-300 md:flex-row">
                  <div className="flex gap-2">
                    <div>{getRelativeDate(date)}</div>
                    <MiniPlusButton
                      href={`/${ws.id}/finance/transactions/new?date=${date}`}
                      className="opacity-0 group-hover:opacity-100"
                    />
                  </div>

                  <div className="flex gap-2">
                    <div className="rounded bg-purple-300/10 px-2 py-0.5 text-base text-purple-300">
                      {data.transactions.length} giao dịch
                    </div>
                    <div
                      className={`rounded px-2 py-0.5 text-base ${
                        data.total < 0
                          ? 'bg-red-300/10 text-red-300'
                          : 'bg-green-300/10 text-green-300'
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
                    mode === 'grid' && 'md:grid-cols-2 xl:grid-cols-4'
                  }`}
                >
                  {data.transactions.map((c) => (
                    <TransactionCard
                      key={c.id}
                      wsId={ws.id}
                      transaction={c}
                      showAmount={true}
                      showDatetime={false}
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

WalletDetailsPage.getLayout = function getLayout(page: ReactElement) {
  return <NestedLayout mode="wallet_details">{page}</NestedLayout>;
};

export default WalletDetailsPage;
