'use client';

import type { ProductBatch } from '@tuturuuu/types/primitives/ProductBatch';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { Separator } from '@tuturuuu/ui/separator';
import { useTranslations } from 'use-intl';
import { batchColumns } from './batch-columns';
import { InventoryDataTableClient } from './inventory-data-table-client';

type InventoryBatchesSearch = {
  page: number;
  pageSize: number;
  q: string;
};

type InventoryBatchesPageProps = {
  canViewInventory: boolean;
  onSearchChange: (search: Partial<InventoryBatchesSearch>) => void;
  search: InventoryBatchesSearch;
  wsId: string;
};

function InventoryBatchesAccessDenied() {
  const t = useTranslations();

  return (
    <div className="flex h-full items-center justify-center">
      <div className="text-center">
        <h2 className="font-semibold text-lg">
          {t('ws-roles.inventory_access_denied')}
        </h2>
        <p className="text-muted-foreground">
          {t('ws-roles.inventory_batches_access_denied_description')}
        </p>
      </div>
    </div>
  );
}

export function InventoryBatchesPage({
  canViewInventory,
  onSearchChange,
  search,
  wsId,
}: InventoryBatchesPageProps) {
  const t = useTranslations();

  if (!canViewInventory) {
    return <InventoryBatchesAccessDenied />;
  }

  return (
    <>
      <FeatureSummary
        createDescription={t('ws-inventory-batches.create_description')}
        createTitle={t('ws-inventory-batches.create')}
        description={t('ws-inventory-batches.description')}
        pluralTitle={t('ws-inventory-batches.plural')}
        singularTitle={t('ws-inventory-batches.singular')}
      />
      <Separator className="my-4" />
      <InventoryDataTableClient<ProductBatch, unknown>
        columnGenerator={batchColumns}
        defaultVisibility={{
          created_at: false,
          id: false,
        }}
        namespace="batch-data-table"
        onSearchChange={onSearchChange}
        resource="batches"
        search={search}
        wsId={wsId}
      />
    </>
  );
}
