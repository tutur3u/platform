import { ReactElement, useEffect, useState } from 'react';
import HeaderX from '../../../../components/metadata/HeaderX';
import { PageWithLayoutProps } from '../../../../types/PageWithLayoutProps';
import { enforceHasWorkspaces } from '../../../../utils/serverless/enforce-has-workspaces';
import NestedLayout from '../../../../components/layouts/NestedLayout';
import useSWR from 'swr';
import { Divider, Switch } from '@mantine/core';
import WarehouseMultiSelector from '../../../../components/selectors/WarehouseMultiSelector';
import PlusCardButton from '../../../../components/common/PlusCardButton';
import GeneralItemCard from '../../../../components/cards/GeneralItemCard';
import { ProductBatch } from '../../../../types/primitives/ProductBatch';
import ModeSelector, {
  Mode,
} from '../../../../components/selectors/ModeSelector';
import { useLocalStorage } from '@mantine/hooks';
import { useWorkspaces } from '../../../../hooks/useWorkspaces';
import { useSegments } from '../../../../hooks/useSegments';
import PaginationSelector from '../../../../components/selectors/PaginationSelector';
import PaginationIndicator from '../../../../components/pagination/PaginationIndicator';
import useTranslation from 'next-translate/useTranslation';

export const getServerSideProps = enforceHasWorkspaces;

const BatchesPage: PageWithLayoutProps = () => {
  const { t } = useTranslation();

  const inventoryLabel = t('sidebar-tabs:inventory');
  const batchesLabel = t('inventory-tabs:batches');

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
              content: batchesLabel,
              href: `/${ws.id}/inventory/batches`,
            },
          ]
        : []
    );

    return () => setRootSegment([]);
  }, [ws, inventoryLabel, batchesLabel, setRootSegment]);

  const [activePage, setPage] = useState(1);
  const [warehouseIds, setWarehouseIds] = useState<string[]>(['']);

  const [itemsPerPage, setItemsPerPage] = useLocalStorage({
    key: 'inventory-batches-items-per-page',
    defaultValue: 15,
  });

  const apiPath = ws?.id
    ? `/api/workspaces/${ws?.id}/inventory/batches?warehouseIds=${warehouseIds.join(
        ','
      )}&page=${activePage}&itemsPerPage=${itemsPerPage}`
    : null;

  const countApi = ws?.id
    ? `/api/workspaces/${ws.id}/inventory/batches/count`
    : null;

  const { data: batches } = useSWR<ProductBatch[]>(apiPath);
  const { data: count } = useSWR<number>(countApi);

  const [showProducts, setShowProducts] = useLocalStorage({
    key: 'inventory-batches-showProducts',
    defaultValue: true,
  });

  const [showWarehouse, setShowWarehouse] = useLocalStorage({
    key: 'inventory-batches-showWarehouse',
    defaultValue: true,
  });

  const [mode, setMode] = useLocalStorage<Mode>({
    key: 'inventory-batches-mode',
    defaultValue: 'grid',
  });

  if (!ws) return null;

  return (
    <>
      <HeaderX label={`${batchesLabel} – ${inventoryLabel}`} />
      <div className="flex min-h-full w-full flex-col ">
        <div className="grid items-end gap-4 md:grid-cols-2 xl:grid-cols-4">
          <ModeSelector mode={mode} setMode={setMode} />
          <PaginationSelector
            items={itemsPerPage}
            setItems={(size) => {
              setPage(1);
              setItemsPerPage(size);
            }}
          />
          <WarehouseMultiSelector
            warehouseIds={warehouseIds}
            setWarehouseIds={setWarehouseIds}
          />
          <Divider variant="dashed" className="col-span-full" />
          <Switch
            label={t('inventory-batches-configs:show-products')}
            checked={showProducts}
            onChange={(event) => setShowProducts(event.currentTarget.checked)}
          />
          <Switch
            label={t('inventory-batches-configs:show-warehouse')}
            checked={showWarehouse}
            onChange={(event) => setShowWarehouse(event.currentTarget.checked)}
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
          <PlusCardButton href={`/${ws.id}/inventory/batches/new`} />
          {batches &&
            batches?.map((batch: ProductBatch) => (
              <GeneralItemCard
                key={batch.id}
                href={`/${ws.id}/inventory/batches/${batch.id}`}
                name={batch.id.replace(/-/g, '')}
                showAmount={showProducts}
                productAmountFetchPath={`/api/workspaces/${ws.id}/inventory/batches/${batch.id}/products/count`}
              />
            ))}
        </div>
      </div>
    </>
  );
};

BatchesPage.getLayout = function getLayout(page: ReactElement) {
  return <NestedLayout mode="inventory">{page}</NestedLayout>;
};

export default BatchesPage;
