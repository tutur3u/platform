import { ReactElement, useEffect, useState } from 'react';
import HeaderX from '../../../../../components/metadata/HeaderX';
import { PageWithLayoutProps } from '../../../../../types/PageWithLayoutProps';
import { enforceHasWorkspaces } from '../../../../../utils/serverless/enforce-has-workspaces';
import NestedLayout from '../../../../../components/layouts/NestedLayout';
import { Divider, Switch } from '@mantine/core';
import { useLocalStorage } from '@mantine/hooks';
import { Transaction } from '../../../../../types/primitives/Transaction';
import useSWR from 'swr';
import TransactionCard from '../../../../../components/cards/TransactionCard';
import { useSegments } from '../../../../../hooks/useSegments';
import { useWorkspaces } from '../../../../../hooks/useWorkspaces';
import ModeSelector, {
  Mode,
} from '../../../../../components/selectors/ModeSelector';
import PaginationSelector from '../../../../../components/selectors/PaginationSelector';
import { Wallet } from '../../../../../types/primitives/Wallet';
import { useRouter } from 'next/router';
import moment from 'moment';
import 'moment/locale/vi';
import MiniPlusButton from '../../../../../components/common/MiniPlusButton';
import PlusCardButton from '../../../../../components/common/PlusCardButton';
import GeneralSearchBar from '../../../../../components/inputs/GeneralSearchBar';

export const getServerSideProps = enforceHasWorkspaces;

const WalletTransactionsPage: PageWithLayoutProps = () => {
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
              content: 'Giao dịch',
              href: `/${wsId}/finance/wallets/${walletId}/transactions`,
            },
          ]
        : []
    );

    return () => setRootSegment([]);
  }, [wsId, walletId, ws, wallet, setRootSegment]);

  const [query, setQuery] = useState('');
  const [activePage, setPage] = useState(1);

  const [itemsPerPage, setItemsPerPage] = useLocalStorage({
    key: 'finance-transactions-items-per-page',
    defaultValue: 15,
  });

  const transactionsApiPath = ws?.id
    ? `/api/workspaces/${ws.id}/finance/transactions?walletIds=${walletId}&query=${query}&page=${activePage}&itemsPerPage=${itemsPerPage}`
    : null;

  // const countApi = ws?.id
  //   ? `/api/workspaces/${ws.id}/finance/transactions/count`
  //   : null;

  const { data: transactions } = useSWR<Transaction[]>(transactionsApiPath);
  // const { data: count } = useSWR<number>(countApi);

  const [mode, setMode] = useLocalStorage<Mode>({
    key: 'finance-wallet-transactions-mode',
    defaultValue: 'grid',
  });

  const [showAmount, setShowAmount] = useLocalStorage({
    key: 'finance-wallet-transactions-showAmount',
    defaultValue: true,
  });

  const [showDatetime, setShowDatetime] = useLocalStorage({
    key: 'finance-wallet-transactions-showDatetime',
    defaultValue: true,
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
      <HeaderX label="Giao dịch – Nguồn tiền" />
      <div className="flex min-h-full w-full flex-col pb-20">
        <div className="mt-2 grid items-end gap-4 md:grid-cols-2 xl:grid-cols-4">
          <GeneralSearchBar setQuery={setQuery} />
          <ModeSelector mode={mode} setMode={setMode} />
          <PaginationSelector
            items={itemsPerPage}
            setItems={(size) => {
              setPage(1);
              setItemsPerPage(size);
            }}
          />
          <Divider variant="dashed" className="col-span-full" />
          <Switch
            label="Hiển thị số tiền"
            checked={showAmount}
            onChange={(event) => setShowAmount(event.currentTarget.checked)}
          />
          <Switch
            label="Hiển thị thời gian"
            checked={showDatetime}
            onChange={(event) => setShowDatetime(event.currentTarget.checked)}
          />
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

WalletTransactionsPage.getLayout = function getLayout(page: ReactElement) {
  return <NestedLayout mode="wallet_details">{page}</NestedLayout>;
};

export default WalletTransactionsPage;
