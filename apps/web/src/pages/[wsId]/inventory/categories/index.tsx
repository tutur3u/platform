import { ReactElement, useEffect, useState } from 'react';
import HeaderX from '../../../../components/metadata/HeaderX';
import { useSegments } from '../../../../hooks/useSegments';
import { PageWithLayoutProps } from '../../../../types/PageWithLayoutProps';
import { enforceHasWorkspaces } from '../../../../utils/serverless/enforce-has-workspaces';
import NestedLayout from '../../../../components/layouts/NestedLayout';
import useSWR from 'swr';
import { Divider, Switch } from '@mantine/core';
import PlusCardButton from '../../../../components/common/PlusCardButton';
import GeneralItemCard from '../../../../components/cards/GeneralItemCard';
import { ProductCategory } from '../../../../types/primitives/ProductCategory';
import ModeSelector, {
  Mode,
} from '../../../../components/selectors/ModeSelector';
import { useLocalStorage } from '@mantine/hooks';
import { useWorkspaces } from '../../../../hooks/useWorkspaces';
import PaginationSelector from '../../../../components/selectors/PaginationSelector';
import PaginationIndicator from '../../../../components/pagination/PaginationIndicator';
import GeneralSearchBar from '../../../../components/inputs/GeneralSearchBar';
import useTranslation from 'next-translate/useTranslation';

export const getServerSideProps = enforceHasWorkspaces;

const CategoriesPage: PageWithLayoutProps = () => {
  const { t } = useTranslation();

  const inventoryLabel = t('sidebar-tabs:inventory');
  const categoriesLabel = t('inventory-tabs:product-categories');

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
            { content: inventoryLabel, href: `/${ws.id}/inventory` },
            {
              content: categoriesLabel,
              href: `/${ws.id}/inventory/categories`,
            },
          ]
        : []
    );

    return () => setRootSegment([]);
  }, [ws, inventoryLabel, categoriesLabel, setRootSegment]);

  const [query, setQuery] = useState('');
  const [activePage, setPage] = useState(1);

  const [itemsPerPage, setItemsPerPage] = useLocalStorage({
    key: 'inventory-categories-items-per-page',
    defaultValue: 15,
  });

  const apiPath = ws?.id
    ? `/api/workspaces/${ws?.id}/inventory/categories?query=${query}&page=${activePage}&itemsPerPage=${itemsPerPage}`
    : null;

  const { data: categories } = useSWR<{
    data: ProductCategory[];
    count: number;
  }>(apiPath);

  const [showProducts, setShowProducts] = useLocalStorage({
    key: 'inventory-categories-showProducts',
    defaultValue: true,
  });

  const [mode, setMode] = useLocalStorage<Mode>({
    key: 'inventory-categories-mode',
    defaultValue: 'grid',
  });

  if (!ws) return null;

  return (
    <>
      <HeaderX label={`${categoriesLabel} – ${inventoryLabel}`} />
      <div className="flex min-h-full w-full flex-col pb-20">
        <div className="grid items-end gap-4 md:grid-cols-2 xl:grid-cols-4">
          <GeneralSearchBar setQuery={setQuery} />
          <ModeSelector mode={mode} setMode={setMode} />
          <PaginationSelector
            items={itemsPerPage}
            setItems={(size) => {
              setPage(1);
              setItemsPerPage(size);
            }}
          />
          <div className="hidden xl:block" />
          <Divider variant="dashed" className="col-span-full" />
          <Switch
            label={t('inventory-categories-configs:show-products')}
            checked={showProducts}
            onChange={(event) => setShowProducts(event.currentTarget.checked)}
          />
        </div>

        <Divider className="mt-4" />
        <PaginationIndicator
          activePage={activePage}
          setActivePage={setPage}
          itemsPerPage={itemsPerPage}
          totalItems={categories?.count}
        />

        <div
          className={`grid gap-4 ${
            mode === 'grid' && 'md:grid-cols-2 xl:grid-cols-4'
          }`}
        >
          <PlusCardButton href={`/${ws.id}/inventory/categories/new`} />
          {categories &&
            categories?.data.map((category: ProductCategory) => (
              <GeneralItemCard
                key={category.id}
                href={`/${ws.id}/inventory/categories/${category.id}`}
                name={category.name}
                showAmount={showProducts}
                // productAmountFetchPath={`/api/categories/${category.id}/products`}
              />
            ))}
        </div>
      </div>
    </>
  );
};

CategoriesPage.getLayout = function getLayout(page: ReactElement) {
  return <NestedLayout mode="inventory">{page}</NestedLayout>;
};

export default CategoriesPage;
