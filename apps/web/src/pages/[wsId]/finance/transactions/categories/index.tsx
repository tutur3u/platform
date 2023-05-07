import { ReactElement, useEffect, useState } from 'react';
import HeaderX from '../../../../../components/metadata/HeaderX';
import { PageWithLayoutProps } from '../../../../../types/PageWithLayoutProps';
import { enforceHasWorkspaces } from '../../../../../utils/serverless/enforce-has-workspaces';
import NestedLayout from '../../../../../components/layouts/NestedLayout';
import { Divider, Switch } from '@mantine/core';
import PlusCardButton from '../../../../../components/common/PlusCardButton';
import { useLocalStorage } from '@mantine/hooks';
import { TransactionCategory } from '../../../../../types/primitives/TransactionCategory';
import useSWR from 'swr';
import GeneralItemCard from '../../../../../components/cards/GeneralItemCard';
import { useSegments } from '../../../../../hooks/useSegments';
import { useWorkspaces } from '../../../../../hooks/useWorkspaces';
import ModeSelector, {
  Mode,
} from '../../../../../components/selectors/ModeSelector';
import PaginationSelector from '../../../../../components/selectors/PaginationSelector';
import PaginationIndicator from '../../../../../components/pagination/PaginationIndicator';
import GeneralSearchBar from '../../../../../components/inputs/GeneralSearchBar';

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
              href: `/${ws.id}/finance/transactions/categories`,
            },
          ]
        : []
    );

    return () => setRootSegment([]);
  }, [ws, setRootSegment]);

  const [query, setQuery] = useState('');
  const [activePage, setPage] = useState(1);

  const [itemsPerPage, setItemsPerPage] = useLocalStorage({
    key: 'finance-categories-items-per-page',
    defaultValue: 15,
  });

  const apiPath = ws?.id
    ? `/api/workspaces/${ws.id}/finance/transactions/categories?query=${query}&page=${activePage}&itemsPerPage=${itemsPerPage}`
    : null;

  const countApi = ws?.id
    ? `/api/workspaces/${ws.id}/finance/transactions/categories/count`
    : null;

  const { data: categories } = useSWR<TransactionCategory[]>(apiPath);
  const { data: count } = useSWR<number>(countApi);

  const [mode, setMode] = useLocalStorage<Mode>({
    key: 'finance-categories-mode',
    defaultValue: 'grid',
  });

  const [showAmount, setShowAmount] = useLocalStorage({
    key: 'finance-transactions-categories-showAmount',
    defaultValue: true,
  });

  if (!ws) return null;

  return (
    <>
      <HeaderX label="Giao dịch – Tài chính" />
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
            label="Hiển thị số giao dịch"
            checked={showAmount}
            onChange={(event) => setShowAmount(event.currentTarget.checked)}
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
          <PlusCardButton
            href={`/${ws.id}/finance/transactions/categories/new`}
          />
          {categories &&
            categories?.map((c) => (
              <GeneralItemCard
                key={c.id}
                href={`/${ws.id}/finance/transactions/categories/${c.id}`}
                name={c.name}
                amountFetchPath={`/api/workspaces/${ws.id}/finance/transactions/categories/${c.id}/amount`}
                amountTrailing="giao dịch"
                showAmount={showAmount}
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
