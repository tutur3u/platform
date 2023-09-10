import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { Divider, Switch } from '@mantine/core';
import PlusCardButton from '../../../../../components/common/PlusCardButton';
import GeneralItemCard from '../../../../../components/cards/GeneralItemCard';
import { ProductSupplier } from '../../../../../types/primitives/ProductSupplier';
import ModeSelector, {
  Mode,
} from '../../../../../components/selectors/ModeSelector';
import { useLocalStorage } from '@mantine/hooks';
import { useSegments } from '../../../../../hooks/useSegments';
import { useWorkspaces } from '../../../../../hooks/useWorkspaces';
import PaginationSelector from '../../../../../components/selectors/PaginationSelector';
import PaginationIndicator from '../../../../../components/pagination/PaginationIndicator';
import GeneralSearchBar from '../../../../../components/inputs/GeneralSearchBar';
import useTranslation from 'next-translate/useTranslation';

export default function SuppliersPage() {
  const { t } = useTranslation();

  const inventoryLabel = t('sidebar-tabs:inventory');
  const suppliersLabel = t('inventory-tabs:suppliers');

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
              content: suppliersLabel,
              href: `/${ws.id}/inventory/suppliers`,
            },
          ]
        : []
    );

    return () => setRootSegment([]);
  }, [ws, inventoryLabel, suppliersLabel, setRootSegment]);

  const [query] = useState('');
  const [activePage, setPage] = useState(1);

  const [itemsPerPage, setItemsPerPage] = useLocalStorage({
    key: 'inventory-suppliers-items-per-page',
    defaultValue: 15,
  });

  const apiPath = ws?.id
    ? `/api/workspaces/${ws?.id}/inventory/suppliers?query=${query}&page=${activePage}&itemsPerPage=${itemsPerPage}`
    : null;

  // const countApi = ws?.id
  //   ? `/api/workspaces/${ws.id}/inventory/suppliers/count`
  //   : null;

  const { data: suppliers } = useSWR<ProductSupplier[]>(apiPath);
  // const { data: count } = useSWR<number>(countApi);

  const [showProducts, setShowProducts] = useLocalStorage({
    key: 'inventory-suppliers-showProducts',
    defaultValue: true,
  });

  const [showBatches, setShowBatches] = useLocalStorage({
    key: 'inventory-suppliers-showBatches',
    defaultValue: true,
  });

  const [mode, setMode] = useLocalStorage<Mode>({
    key: 'inventory-suppliers-mode',
    defaultValue: 'grid',
  });

  if (!ws) return null;

  return (
    <div className="flex min-h-full w-full flex-col ">
      <div className="grid items-end gap-4 md:grid-cols-2 xl:grid-cols-4">
        <GeneralSearchBar />
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
          label={t('inventory-suppliers-configs:show-products')}
          checked={showProducts}
          onChange={(event) => setShowProducts(event.currentTarget.checked)}
        />
        <Switch
          label={t('inventory-suppliers-configs:show-batches')}
          checked={showBatches}
          onChange={(event) => setShowBatches(event.currentTarget.checked)}
        />
      </div>

      <Divider className="mt-4" />
      <PaginationIndicator totalItems={0} />

      <div
        className={`grid gap-4 ${
          mode === 'grid' && 'md:grid-cols-2 xl:grid-cols-4'
        }`}
      >
        <PlusCardButton href={`/${ws.id}/inventory/suppliers/new`} />
        {suppliers &&
          suppliers?.map((supplier: ProductSupplier) => (
            <GeneralItemCard
              key={supplier.id}
              href={`/${ws.id}/inventory/suppliers/${supplier.id}`}
              name={supplier.name}
              showAmount={showProducts || showBatches}
            />
          ))}
      </div>
    </div>
  );
}
