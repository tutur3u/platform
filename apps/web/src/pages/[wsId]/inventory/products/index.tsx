import { ReactElement, useEffect, useState } from 'react';
import HeaderX from '../../../../components/metadata/HeaderX';
import { PageWithLayoutProps } from '../../../../types/PageWithLayoutProps';
import { enforceHasWorkspaces } from '../../../../utils/serverless/enforce-has-workspaces';
import NestedLayout from '../../../../components/layouts/NestedLayout';
import useSWR from 'swr';
import { Divider, Switch } from '@mantine/core';
import CategoryMultiSelector from '../../../../components/selectors/CategoryMultiSelector';
import PlusCardButton from '../../../../components/common/PlusCardButton';
import ProductCard from '../../../../components/cards/ProductCard';
import ModeSelector, {
  Mode,
} from '../../../../components/selectors/ModeSelector';
import { useLocalStorage } from '@mantine/hooks';
import { Product } from '../../../../types/primitives/Product';
import { useWorkspaces } from '../../../../hooks/useWorkspaces';
import { useSegments } from '../../../../hooks/useSegments';
import PaginationSelector from '../../../../components/selectors/PaginationSelector';
import PaginationIndicator from '../../../../components/pagination/PaginationIndicator';
import WarehouseMultiSelector from '../../../../components/selectors/WarehouseMultiSelector';
import GeneralSearchBar from '../../../../components/inputs/GeneralSearchBar';
import useTranslation from 'next-translate/useTranslation';

export const getServerSideProps = enforceHasWorkspaces;

const ProductsPage: PageWithLayoutProps = () => {
  const { t } = useTranslation();

  const inventoryLabel = t('sidebar-tabs:inventory');
  const productsLabel = t('inventory-tabs:products');

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
              content: productsLabel,
              href: `/${ws.id}/inventory/products`,
            },
          ]
        : []
    );

    return () => setRootSegment([]);
  }, [ws, inventoryLabel, productsLabel, setRootSegment]);

  const [query, setQuery] = useState('');
  const [activePage, setPage] = useState(1);

  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [warehouseIds, setWarehouseIds] = useState<string[]>([]);

  const [itemsPerPage, setItemsPerPage] = useLocalStorage({
    key: 'inventory-products-items-per-page',
    defaultValue: 15,
  });

  const apiPath = ws?.id
    ? `/api/workspaces/${ws?.id}/inventory/products?categoryIds=${
        categoryIds.length > 0 ? categoryIds.join(',') : ''
      }&warehouseIds=${
        warehouseIds.length > 0 ? warehouseIds.join(',') : ''
      }&query=${query}&page=${activePage}&itemsPerPage=${itemsPerPage}`
    : null;

  const { data: productsData } = useSWR<{ data: Product[]; count: number }>(
    apiPath
  );

  const [showAmount, setShowAmount] = useLocalStorage({
    key: 'inventory-products-showAmount',
    defaultValue: false,
  });

  const [showSupplier, setShowSupplier] = useLocalStorage({
    key: 'inventory-products-showSupplier',
    defaultValue: true,
  });

  const [showCategory, setShowCategory] = useLocalStorage({
    key: 'inventory-products-showCategory',
    defaultValue: false,
  });

  const [showPrice, setShowPrice] = useLocalStorage({
    key: 'inventory-products-showPrice',
    defaultValue: true,
  });

  const [mode, setMode] = useLocalStorage<Mode>({
    key: 'inventory-products-mode',
    defaultValue: 'grid',
  });

  if (!ws) return null;

  const enablePrice =
    warehouseIds.length > 0 && warehouseIds[0] !== '' && showPrice;

  return (
    <>
      <HeaderX label={`${productsLabel} – ${inventoryLabel}`} />
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
          <CategoryMultiSelector
            categoryIds={categoryIds}
            setCategoryIds={setCategoryIds}
          />
          <WarehouseMultiSelector
            warehouseIds={warehouseIds}
            setWarehouseIds={setWarehouseIds}
          />
          <Divider variant="dashed" className="col-span-full" />
          <Switch
            label={t('inventory-products-configs:show-amount')}
            checked={showAmount}
            onChange={(event) => setShowAmount(event.currentTarget.checked)}
          />
          <Switch
            label={t('inventory-products-configs:show-supplier')}
            checked={showSupplier}
            onChange={(event) => setShowSupplier(event.currentTarget.checked)}
          />
          <Switch
            label={t('inventory-products-configs:show-category')}
            checked={showCategory}
            onChange={(event) => setShowCategory(event.currentTarget.checked)}
          />
          <Switch
            label={t('inventory-products-configs:show-price')}
            checked={enablePrice}
            onChange={(event) => setShowPrice(event.currentTarget.checked)}
            disabled={!enablePrice}
          />
        </div>

        <Divider className="mt-4" />
        <PaginationIndicator
          activePage={activePage}
          setActivePage={setPage}
          itemsPerPage={itemsPerPage}
          totalItems={productsData?.count}
        />

        <div
          className={`grid gap-4 ${
            mode === 'grid' && 'md:grid-cols-2 xl:grid-cols-4'
          }`}
        >
          <PlusCardButton href={`/${ws.id}/inventory/products/new`} />
          {productsData &&
            productsData.data?.map((p: Product, idx) => (
              <ProductCard
                key={`${p.id}-${p.unit}-${idx}`}
                product={p}
                showSupplier={showSupplier}
                showCategory={showCategory}
                showAmount={showAmount}
                showPrice={enablePrice}
              />
            ))}
        </div>
      </div>
    </>
  );
};

ProductsPage.getLayout = function getLayout(page: ReactElement) {
  return <NestedLayout mode="inventory">{page}</NestedLayout>;
};

export default ProductsPage;
