'use client';

import {
  Boxes,
  CheckCircle2,
  Layers3,
  PackageSearch,
  Plus,
  Store,
  User,
} from '@tuturuuu/icons';
import type { InventoryProductFormOptionsResponse } from '@tuturuuu/internal-api/inventory';
import {
  createInventoryManufacturer,
  createInventoryOwner,
  createInventorySupplier,
  createInventoryUnit,
  createInventoryWarehouse,
  deleteInventoryManufacturer,
  deleteInventoryOwner,
  deleteInventorySupplier,
  deleteInventoryUnit,
  deleteInventoryWarehouse,
  updateInventoryManufacturer,
  updateInventoryOwner,
  updateInventorySupplier,
  updateInventoryUnit,
  updateInventoryWarehouse,
} from '@tuturuuu/internal-api/inventory';
import type { ProductBatch } from '@tuturuuu/types/primitives/ProductBatch';
import type { ProductSupplier } from '@tuturuuu/types/primitives/ProductSupplier';
import { Accordion } from '@tuturuuu/ui/accordion';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import { OperatorMetricCard } from './operator-dashboard-primitives';
import { EmptyRow } from './operator-shell';
import { BatchSection } from './setup-batch-section';
import { namedRows, type ResourceConfig } from './setup-helpers';
import { ResourceDialog, ResourceSection } from './setup-resource-section';

export function SetupPanel({
  batches,
  options,
  suppliers,
  wsId,
}: {
  batches: ProductBatch[];
  options?: InventoryProductFormOptionsResponse;
  suppliers: ProductSupplier[];
  wsId: string;
}) {
  const t = useTranslations('inventory.operator.setup');
  const configs: ResourceConfig[] = [
    {
      create: (name) => createInventoryOwner(wsId, { name }),
      icon: User,
      key: 'owners',
      remove: (id) => deleteInventoryOwner(wsId, id),
      rows: options?.owners ?? [],
      title: t('owners'),
      update: (id, name) => updateInventoryOwner(wsId, id, { name }),
    },
    {
      create: (name) => createInventoryManufacturer(wsId, { name }),
      icon: PackageSearch,
      key: 'manufacturers',
      remove: (id) => deleteInventoryManufacturer(wsId, id),
      rows: options?.manufacturers ?? [],
      title: t('manufacturers'),
      update: (id, name) => updateInventoryManufacturer(wsId, id, { name }),
    },
    {
      create: (name) => createInventoryUnit(wsId, { name }),
      icon: Boxes,
      key: 'units',
      remove: (id) => deleteInventoryUnit(wsId, id),
      rows: options?.units ?? [],
      title: t('units'),
      update: (id, name) => updateInventoryUnit(wsId, id, { name }),
    },
    {
      create: (name) => createInventoryWarehouse(wsId, { name }),
      icon: Boxes,
      key: 'warehouses',
      remove: (id) => deleteInventoryWarehouse(wsId, id),
      rows: options?.warehouses ?? [],
      title: t('warehouses'),
      update: (id, name) => updateInventoryWarehouse(wsId, id, { name }),
    },
    {
      create: (name) => createInventorySupplier(wsId, { name }),
      icon: Store,
      key: 'suppliers',
      remove: (id) => deleteInventorySupplier(wsId, id),
      rows: namedRows(suppliers),
      title: t('suppliers'),
      update: (id, name) => updateInventorySupplier(wsId, id, { name }),
    },
  ];
  const readyGroups = configs.filter((config) => config.rows.length > 0).length;
  const totalRecords =
    configs.reduce((total, config) => total + config.rows.length, 0) +
    batches.length;
  const isEmptyWorkspace = totalRecords === 0;

  return (
    <div className="grid gap-3">
      <div className="grid min-w-0 grid-cols-2 gap-2 md:grid-cols-3 md:gap-3 [&>*:last-child]:col-span-2 md:[&>*:last-child]:col-span-1">
        <OperatorMetricCard
          description={t('matrix.readyGroupsDescription')}
          icon={CheckCircle2}
          label={t('matrix.readyGroups')}
          tone={readyGroups === configs.length ? 'success' : 'warning'}
          value={`${readyGroups}/${configs.length}`}
        />
        <OperatorMetricCard
          description={t('matrix.recordsDescription')}
          icon={Boxes}
          label={t('matrix.records')}
          value={totalRecords}
        />
        <OperatorMetricCard
          description={t('matrix.batchesDescription')}
          icon={Layers3}
          label={t('matrix.batches')}
          value={batches.length}
        />
      </div>
      {isEmptyWorkspace ? (
        <EmptyRow
          action={
            <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-center">
              {configs.slice(0, 5).map((config) => (
                <ResourceDialog
                  config={config}
                  key={config.key}
                  trigger={
                    <Button
                      className="min-h-10 w-full touch-manipulation sm:min-h-9 sm:w-auto"
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      <Plus className="h-4 w-4" />
                      {config.title}
                    </Button>
                  }
                  wsId={wsId}
                />
              ))}
            </div>
          }
          description={t('emptyWorkspaceDescription')}
          label={t('emptyWorkspaceTitle')}
        />
      ) : null}
      <Accordion className="grid min-w-0 gap-2" type="multiple">
        {configs.map((config) => (
          <ResourceSection config={config} key={config.key} wsId={wsId} />
        ))}
      </Accordion>
      <BatchSection
        batches={batches}
        options={options}
        suppliers={suppliers}
        wsId={wsId}
      />
    </div>
  );
}
