import { ReactElement, useEffect, useState } from 'react';
import HeaderX from '../../../../components/metadata/HeaderX';
import { PageWithLayoutProps } from '../../../../types/PageWithLayoutProps';
import { enforceHasWorkspaces } from '../../../../utils/serverless/enforce-has-workspaces';
import NestedLayout from '../../../../components/layouts/NestedLayout';
import { Divider, Switch, TextInput } from '@mantine/core';
import { MagnifyingGlassIcon } from '@heroicons/react/24/solid';
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
import SidebarLink from '../../../../components/layouts/SidebarLink';
import moment from 'moment';
import MiniPlusButton from '../../../../components/common/MiniPlusButton';
import 'moment/locale/vi';
import PlusCardButton from '../../../../components/common/PlusCardButton';

export const getServerSideProps = enforceHasWorkspaces;

const FinanceTransactionsPage: PageWithLayoutProps = () => {
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
            {
              content: 'Giao dịch',
              href: `/${ws.id}/finance/transactions`,
            },
          ]
        : []
    );

    return () => setRootSegment([]);
  }, [ws, setRootSegment]);

  const [query, setQuery] = useState('');
  const [activePage, setPage] = useState(1);

  const [itemsPerPage, setItemsPerPage] = useLocalStorage({
    key: 'finance-transactions-items-per-page',
    defaultValue: 15,
  });

  const apiPath = ws?.id
    ? `/api/workspaces/${ws.id}/finance/transactions?query=${query}&page=${activePage}&itemsPerPage=${itemsPerPage}`
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

  const transactionsByDate = transactions?.reduce((acc, cur) => {
    const date = moment(cur.taken_at).toDate();
    const localeDate = date.toLocaleDateString();

    if (!acc[localeDate]) acc[localeDate] = [];
    acc[localeDate].push(cur);

    return acc;
  }, {} as Record<string, Transaction[]>);

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
      <HeaderX label="Giao dịch – Tài chính" />
      <div className="flex min-h-full w-full flex-col pb-8">
        <div className="mt-2 grid items-end gap-4 md:grid-cols-2 xl:grid-cols-4">
          <TextInput
            label="Tìm kiếm"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Nhập từ khoá để tìm kiếm"
            icon={<MagnifyingGlassIcon className="h-5" />}
            classNames={{
              input: 'bg-white/5 border-zinc-300/20 font-semibold',
            }}
          />
          <ModeSelector mode={mode} setMode={setMode} />
          <PaginationSelector
            items={itemsPerPage}
            setItems={(size) => {
              setPage(1);
              setItemsPerPage(size);
            }}
          />
          {ws && (
            <SidebarLink
              href={`/${ws.id}/finance/import`}
              label="Nhập dữ liệu từ tệp"
              className="border border-zinc-300/10 bg-zinc-400/5 text-center hover:bg-transparent"
            />
          )}
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
          <Switch
            label="Hiển thị nguồn tiền"
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
          <h3 className="col-span-full text-lg font-semibold text-gray-300">
            Giao dịch mới
          </h3>
          <PlusCardButton href={`/${ws.id}/finance/transactions/new`} />
        </div>

        <div className="mt-8 grid gap-8">
          {transactionsByDate &&
            Object.entries(transactionsByDate).length > 0 &&
            Object.entries(transactionsByDate).map(([date, transactions]) => (
              <div key={date} className="group">
                <h3 className="col-span-full flex gap-2 text-lg font-semibold text-gray-300">
                  <div>{getRelativeDate(date)}</div>
                  <MiniPlusButton
                    href={`/${ws.id}/finance/transactions/new?date=${date}`}
                    className="opacity-0 group-hover:opacity-100"
                  />
                </h3>

                <div
                  className={`mt-2 grid gap-4 ${
                    mode === 'grid' && 'md:grid-cols-2 xl:grid-cols-4'
                  }`}
                >
                  {transactions.map((c) => (
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
