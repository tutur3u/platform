'use client';

import {
  Boxes,
  CheckCircle2,
  Layers3,
  PackageSearch,
  Store,
  User,
} from '@tuturuuu/icons';
import type { InventoryProductFormOptionsResponse } from '@tuturuuu/internal-api/inventory';
import {
  createInventoryManufacturer,
  createInventoryOwner,
  createInventoryProductCategory,
  createInventorySupplier,
  createInventoryUnit,
  createInventoryWarehouse,
  deleteInventoryManufacturer,
  deleteInventoryOwner,
  deleteInventoryProductCategory,
  deleteInventorySupplier,
  deleteInventoryUnit,
  deleteInventoryWarehouse,
  updateInventoryManufacturer,
  updateInventoryOwner,
  updateInventoryProductCategory,
  updateInventorySupplier,
  updateInventoryUnit,
  updateInventoryWarehouse,
} from '@tuturuuu/internal-api/inventory';
import type { ProductBatch } from '@tuturuuu/types/primitives/ProductBatch';
import type { ProductSupplier } from '@tuturuuu/types/primitives/ProductSupplier';
import { useTranslations } from 'next-intl';
import { OperatorMetricCard } from './operator-dashboard-primitives';
import { BatchSection } from './setup-batch-section';
import { namedRows, type ResourceConfig } from './setup-helpers';
import { ResourceSection } from './setup-resource-section';

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
      create: (name) => createInventoryProductCategory(wsId, { name }),
      icon: PackageSearch,
      key: 'categories',
      remove: (id) => deleteInventoryProductCategory(wsId, id),
      rows: options?.categories ?? [],
      title: t('categories'),
      update: (id, name) => updateInventoryProductCategory(wsId, id, { name }),
    },
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

  return (
    <div className="grid gap-3">
      <div className="grid min-w-0 gap-3 md:grid-cols-3">
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
      <div className="grid min-w-0 gap-3 lg:grid-cols-2">
        {configs.map((config) => (
          <ResourceSection config={config} key={config.key} wsId={wsId} />
        ))}
      </div>
      <BatchSection
        batches={batches}
        options={options}
        suppliers={suppliers}
        wsId={wsId}
      />
    </div>
  );
}
