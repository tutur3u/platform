import { useState } from 'react';
import useSWR from 'swr';
import { Divider, Switch } from '@mantine/core';
import PlusCardButton from '../../../../../components/common/PlusCardButton';
import GeneralItemCard from '../../../../../components/cards/GeneralItemCard';
import { ProductWarehouse } from '../../../../../types/primitives/ProductWarehouse';
import ModeSelector, {
  Mode,
} from '../../../../../components/selectors/ModeSelector';
import { useLocalStorage } from '@mantine/hooks';
import { useWorkspaces } from '../../../../../hooks/useWorkspaces';
import PaginationSelector from '../../../../../components/selectors/PaginationSelector';
import PaginationIndicator from '../../../../../components/pagination/PaginationIndicator';
import GeneralSearchBar from '../../../../../components/inputs/GeneralSearchBar';
import useTranslation from 'next-translate/useTranslation';

export default function WarehousesPage() {
  const { t } = useTranslation();

  const { ws } = useWorkspaces();

  const [query, setQuery] = useState('');
  const [activePage, setPage] = useState(1);

  const [itemsPerPage, setItemsPerPage] = useLocalStorage({
    key: 'inventory-warehouses-items-per-page',
    defaultValue: 15,
  });

  const apiPath = ws?.id
    ? `/api/workspaces/${ws?.id}/inventory/warehouses?query=${query}&page=${activePage}&itemsPerPage=${itemsPerPage}`
    : null;

  const countApi = ws?.id
    ? `/api/workspaces/${ws.id}/inventory/warehouses/count`
    : null;

  const { data: warehouses } = useSWR<ProductWarehouse[]>(apiPath);
  const { data: count } = useSWR<number>(countApi);

  const [showProducts, setShowProducts] = useLocalStorage({
    key: 'inventory-warehouses-showProducts',
    defaultValue: true,
  });

  const [showBatches, setShowBatches] = useLocalStorage({
    key: 'inventory-warehouses-showBatches',
    defaultValue: true,
  });

  const [mode, setMode] = useLocalStorage<Mode>({
    key: 'inventory-warehouses-mode',
    defaultValue: 'grid',
  });

  if (!ws) return null;

  return (
    <div className="flex min-h-full w-full flex-col ">
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
          label={t('inventory-warehouses-configs:show-products')}
          checked={showProducts}
          onChange={(event) => setShowProducts(event.currentTarget.checked)}
        />
        <Switch
          label={t('inventory-warehouses-configs:show-batches')}
          checked={showBatches}
          onChange={(event) => setShowBatches(event.currentTarget.checked)}
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
        <PlusCardButton href={`/${ws.id}/inventory/warehouses/new`} />

        {warehouses &&
          warehouses?.map((warehouse: ProductWarehouse) => (
            <GeneralItemCard
              key={warehouse.id}
              href={`/${ws.id}/inventory/warehouses/${warehouse.id}`}
              name={warehouse.name}
              // showAmount={showProducts || showBatches}
              // showSecondaryLabel={showTeamName}
              productAmountFetchPath={`/api/warehouses/${warehouse.id}/products`}
              // secondaryLabelFetchPath={
              //   warehouse.team_id
              //     ? `/api/teams/${warehouse.team_id}`
              //     : undefined
              // }
            />
          ))}
      </div>
    </div>
  );
}
