import { ReactElement, useEffect, useState } from 'react';
import HeaderX from '../../../../components/metadata/HeaderX';
import { useSegments } from '../../../../hooks/useSegments';
import { PageWithLayoutProps } from '../../../../types/PageWithLayoutProps';
import { enforceHasWorkspaces } from '../../../../utils/serverless/enforce-has-workspaces';
import NestedLayout from '../../../../components/layouts/NestedLayout';
import { Divider, Switch, TextInput } from '@mantine/core';
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
import PaginationSelector from '../../../../components/selectors/PaginationSelector';
import PaginationIndicator from '../../../../components/pagination/PaginationIndicator';
import SidebarLink from '../../../../components/layouts/SidebarLink';

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

  const [query, setQuery] = useState('');
  const [activePage, setPage] = useState(1);

  const [itemsPerPage, setItemsPerPage] = useLocalStorage({
    key: 'finance-wallets-items-per-page',
    defaultValue: 15,
  });

  const apiPath = ws?.id
    ? `/api/workspaces/${ws.id}/finance/wallets?query=${query}&page=${activePage}&itemsPerPage=${itemsPerPage}`
    : null;

  const countApi = ws?.id
    ? `/api/workspaces/${ws.id}/finance/wallets/count`
    : null;

  const { data: wallets } = useSWR<Wallet[]>(apiPath);
  const { data: count } = useSWR<number>(countApi);

  const [mode, setMode] = useLocalStorage<Mode>({
    key: 'finance-wallets-mode',
    defaultValue: 'grid',
  });

  const [showPrice, setShowPrice] = useLocalStorage({
    key: 'finance-wallets-showPrice',
    defaultValue: true,
  });

  return (
    <>
      <HeaderX label="Nguồn tiền – Tài chính" />
      <div className="flex min-h-full w-full flex-col pb-20">
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
            checked={showPrice}
            onChange={(event) => setShowPrice(event.currentTarget.checked)}
          />
        </div>

        <Divider className="mt-4" />
        <PaginationIndicator
          activePage={activePage}
          setActivePage={setPage}
          itemsPerPage={itemsPerPage}
          totalItems={count}
        />

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
