import { ReactElement, useEffect, useState } from 'react';
import HeaderX from '../../../../../components/metadata/HeaderX';
import { PageWithLayoutProps } from '../../../../../types/PageWithLayoutProps';
import { enforceHasWorkspaces } from '../../../../../utils/serverless/enforce-has-workspaces';
import NestedLayout from '../../../../../components/layouts/NestedLayout';
import { Divider, Pagination, Switch, TextInput } from '@mantine/core';
import { useSegments } from '../../../../../hooks/useSegments';
import { useWorkspaces } from '../../../../../hooks/useWorkspaces';
import { useRouter } from 'next/router';
import { Wallet } from '../../../../../types/primitives/Wallet';
import useSWR from 'swr';
import TransactionCard from '../../../../../components/cards/TransactionCard';
import ModeSelector, {
  Mode,
} from '../../../../../components/selectors/ModeSelector';
import { MagnifyingGlassIcon } from '@heroicons/react/24/solid';
import { Transaction } from '../../../../../types/primitives/Transaction';
import { useLocalStorage } from '@mantine/hooks';
import PlusCardButton from '../../../../../components/common/PlusCardButton';

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

  const transactionsApiPath =
    wsId && walletId
      ? `/api/workspaces/${wsId}/finance/transactions?walletIds=${walletId}`
      : null;

  const { data: transactions } = useSWR<Transaction[]>(transactionsApiPath);

  const [mode, setMode] = useLocalStorage<Mode>({
    key: 'finance-transactions-mode',
    defaultValue: 'grid',
  });

  const [showAmount, setShowAmount] = useLocalStorage({
    key: 'finance-wallets-showAmount',
    defaultValue: true,
  });

  const [query, setQuery] = useState('');
  const [activePage, setPage] = useState(1);

  if (!ws) return null;

  return (
    <>
      <HeaderX label="Nguồn tiền – Tài chính" />
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
          <div className="col-span-2 hidden xl:block" />
          <Divider variant="dashed" className="col-span-full" />
          <Switch
            label="Hiển thị số tiền"
            checked={showAmount}
            onChange={(event) => setShowAmount(event.currentTarget.checked)}
          />
        </div>

        <Divider className="mt-4" />
        <div className="flex items-center justify-center py-4 text-center">
          <Pagination value={activePage} onChange={setPage} total={10} noWrap />
        </div>

        <div
          className={`grid gap-4 ${
            mode === 'grid' && 'md:grid-cols-2 xl:grid-cols-4'
          }`}
        >
          <PlusCardButton
            href={`/${wsId}/finance/transactions/new?walletId=${walletId}`}
          />
          {transactions &&
            transactions?.map((c) => (
              <TransactionCard
                key={c.id}
                transaction={c}
                showAmount={showAmount}
                redirectToWallets
              />
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
