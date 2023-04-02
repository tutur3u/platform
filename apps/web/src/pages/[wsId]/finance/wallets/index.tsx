import { ReactElement, useEffect, useState } from 'react';
import HeaderX from '../../../../components/metadata/HeaderX';
import { useSegments } from '../../../../hooks/useSegments';
import { PageWithLayoutProps } from '../../../../types/PageWithLayoutProps';
import { enforceHasWorkspaces } from '../../../../utils/serverless/enforce-has-workspaces';
import NestedLayout from '../../../../components/layouts/NestedLayout';
import { Divider, Pagination, Switch, TextInput } from '@mantine/core';
import PlusCardButton from '../../../../components/common/PlusCardButton';
import { MagnifyingGlassIcon } from '@heroicons/react/24/solid';
import { useLocalStorage } from '@mantine/hooks';
import { Wallet } from '../../../../types/primitives/Wallet';
import useSWR from 'swr';
import { useWorkspaces } from '../../../../hooks/useWorkspaces';
import ModeSelector, {
  Mode,
} from '../../../../components/selectors/ModeSelector';
import WalletCard from '../../../../components/cards/WalletCard';

export const getServerSideProps = enforceHasWorkspaces;

const FinanceWalletsPage: PageWithLayoutProps = () => {
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
              content: 'Nguồn tiền',
              href: `/${ws.id}/finance/wallets`,
            },
          ]
        : []
    );

    return () => setRootSegment([]);
  }, [ws, setRootSegment]);

  const apiPath = `/api/workspaces/${ws?.id}/finance/wallets`;

  const { data: wallets } = useSWR<Wallet[]>(ws?.id ? apiPath : null);

  const [mode, setMode] = useLocalStorage<Mode>({
    key: 'finance-wallets-mode',
    defaultValue: 'grid',
  });

  const [showPrice, setShowPrice] = useLocalStorage({
    key: 'finance-wallets-showPrice',
    defaultValue: true,
  });

  const [query, setQuery] = useState('');
  const [activePage, setPage] = useState(1);

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
            label="Hiển thị tiền trong ví"
            checked={showPrice}
            onChange={(event) => setShowPrice(event.currentTarget.checked)}
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
          <PlusCardButton href={`/${ws?.id}/finance/wallets/new`} />
          {wallets &&
            wallets?.map((w: Wallet) => (
              <WalletCard key={w.id} wallet={w} showPrice={showPrice} />
            ))}
        </div>
      </div>
    </>
  );
};

FinanceWalletsPage.getLayout = function getLayout(page: ReactElement) {
  return <NestedLayout mode="finance">{page}</NestedLayout>;
};

export default FinanceWalletsPage;
