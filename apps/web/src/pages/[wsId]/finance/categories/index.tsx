import { ReactElement, useEffect, useState } from 'react';
import HeaderX from '../../../../components/metadata/HeaderX';
import { PageWithLayoutProps } from '../../../../types/PageWithLayoutProps';
import { enforceHasWorkspaces } from '../../../../utils/serverless/enforce-has-workspaces';
import NestedLayout from '../../../../components/layouts/NestedLayout';
import { Divider, Pagination, TextInput } from '@mantine/core';
import { MagnifyingGlassIcon } from '@heroicons/react/24/solid';
import PlusCardButton from '../../../../components/common/PlusCardButton';
import { useLocalStorage } from '@mantine/hooks';
import { TransactionCategory } from '../../../../types/primitives/TransactionCategory';
import useSWR from 'swr';
import GeneralItemCard from '../../../../components/cards/GeneralItemCard';
import { useSegments } from '../../../../hooks/useSegments';
import { useWorkspaces } from '../../../../hooks/useWorkspaces';
import ModeSelector, {
  Mode,
} from '../../../../components/selectors/ModeSelector';

export const getServerSideProps = enforceHasWorkspaces;

const FinanceCategoriesPage: PageWithLayoutProps = () => {
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
              content: 'Danh mục giao dịch',
              href: `/${ws.id}/finance/categories`,
            },
          ]
        : []
    );

    return () => setRootSegment([]);
  }, [ws, setRootSegment]);

  const apiPath = `/api/workspaces/${ws?.id}/finance/transactions/categories`;

  const { data: categories } = useSWR<TransactionCategory[]>(
    ws?.id ? apiPath : null
  );

  const [mode, setMode] = useLocalStorage<Mode>({
    key: 'finance-categories-mode',
    defaultValue: 'grid',
  });

  const [query, setQuery] = useState('');
  const [activePage, setPage] = useState(1);

  if (!ws) return null;

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
          <PlusCardButton href="/inventory/products/new" />
          {categories &&
            categories?.map((c) => (
              <GeneralItemCard
                key={c.id}
                href={`/${ws.id}}/inventory/products/${c.id}`}
                name={c.name}
              />
            ))}
        </div>
      </div>
    </>
  );
};

FinanceCategoriesPage.getLayout = function getLayout(page: ReactElement) {
  return <NestedLayout mode="finance">{page}</NestedLayout>;
};

export default FinanceCategoriesPage;
