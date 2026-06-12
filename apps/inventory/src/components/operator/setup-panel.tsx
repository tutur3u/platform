'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Boxes,
  Layers3,
  PackageSearch,
  Plus,
  Save,
  Store,
  Trash2,
  User,
} from '@tuturuuu/icons';
import type { InventoryProductFormOptionsResponse } from '@tuturuuu/internal-api/inventory';
import {
  createInventoryBatch,
  createInventoryManufacturer,
  createInventoryOwner,
  createInventoryProductCategory,
  createInventorySupplier,
  createInventoryUnit,
  createInventoryWarehouse,
  deleteInventoryBatch,
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
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { type ComponentType, type FormEvent, useState } from 'react';
import { EmptyRow } from './operator-shell';

type NamedResource = { id: string; name?: string | null };
type ResourceConfig = {
  key: string;
  icon: ComponentType<{ className?: string }>;
  title: string;
  rows: NamedResource[];
  create: (name: string) => Promise<unknown>;
  update: (id: string, name: string) => Promise<unknown>;
  remove: (id: string) => Promise<unknown>;
};

function invalidateSetup(
  queryClient: ReturnType<typeof useQueryClient>,
  wsId: string
) {
  queryClient.invalidateQueries({
    queryKey: ['inventory', wsId, 'form-options'],
  });
  queryClient.invalidateQueries({ queryKey: ['inventory', wsId, 'suppliers'] });
  queryClient.invalidateQueries({ queryKey: ['inventory', wsId, 'batches'] });
}

function namedRows(rows: Array<{ id?: string; name?: string | null }>) {
  return rows.filter((row): row is NamedResource => Boolean(row.id));
}

function ResourceRow({
  config,
  item,
  wsId,
}: {
  config: ResourceConfig;
  item: NamedResource;
  wsId: string;
}) {
  const t = useTranslations('inventory.operator.forms');
  const queryClient = useQueryClient();
  const [name, setName] = useState(item.name ?? '');
  const updateMutation = useMutation({
    mutationFn: () => config.update(item.id, name),
    onError: () => toast.error(t('saveError')),
    onSuccess: () => {
      toast.success(t('saveSuccess'));
      invalidateSetup(queryClient, wsId);
    },
  });
  const deleteMutation = useMutation({
    mutationFn: () => config.remove(item.id),
    onError: () => toast.error(t('deleteError')),
    onSuccess: () => {
      toast.success(t('deleteSuccess'));
      invalidateSetup(queryClient, wsId);
    },
  });

  return (
    <div className="grid gap-2 border-border border-t p-2 sm:grid-cols-[1fr_auto_auto]">
      <input
        className="h-8 rounded-md border border-border bg-background px-2 text-sm"
        onChange={(event) => setName(event.target.value)}
        value={name}
      />
      <button
        className="inline-flex h-8 items-center justify-center rounded-md border border-border px-2 disabled:opacity-50"
        disabled={!name || updateMutation.isPending}
        onClick={() => updateMutation.mutate()}
        type="button"
      >
        <Save className="h-4 w-4" />
      </button>
      <button
        className="inline-flex h-8 items-center justify-center rounded-md border border-destructive/30 px-2 text-destructive disabled:opacity-50"
        disabled={deleteMutation.isPending}
        onClick={() => deleteMutation.mutate()}
        type="button"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

function ResourceSection({
  config,
  wsId,
}: {
  config: ResourceConfig;
  wsId: string;
}) {
  const t = useTranslations('inventory.operator.forms');
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const Icon = config.icon;
  const createMutation = useMutation({
    mutationFn: () => config.create(name),
    onError: () => toast.error(t('saveError')),
    onSuccess: () => {
      setName('');
      toast.success(t('saveSuccess'));
      invalidateSetup(queryClient, wsId);
    },
  });

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between gap-3 border-border border-b px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Icon className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate font-medium text-sm">{config.title}</p>
            <p className="text-muted-foreground text-xs">
              {config.rows.length}
            </p>
          </div>
        </div>
      </div>
      <form
        className="grid gap-2 p-3 sm:grid-cols-[1fr_auto]"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          if (name) createMutation.mutate();
        }}
      >
        <input
          className="h-9 rounded-md border border-border bg-background px-3 text-sm"
          onChange={(event) => setName(event.target.value)}
          placeholder={config.title}
          value={name}
        />
        <button
          className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-primary px-3 font-medium text-primary-foreground text-sm disabled:opacity-50"
          disabled={!name || createMutation.isPending}
          type="submit"
        >
          <Plus className="h-4 w-4" />
          {t('create')}
        </button>
      </form>
      {config.rows.length ? (
        config.rows.map((item) => (
          <ResourceRow
            config={config}
            item={item}
            key={`${config.key}-${item.id}`}
            wsId={wsId}
          />
        ))
      ) : (
        <div className="px-3 pb-3">
          <EmptyRow label={t('emptyResource')} />
        </div>
      )}
    </section>
  );
}

function BatchSection({
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
  const t = useTranslations('inventory.operator.forms');
  const queryClient = useQueryClient();
  const [warehouseId, setWarehouseId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [price, setPrice] = useState('');
  const createMutation = useMutation({
    mutationFn: () =>
      createInventoryBatch(wsId, {
        price: Number(price || 0),
        supplier_id: supplierId || null,
        warehouse_id: warehouseId,
      }),
    onError: () => toast.error(t('saveError')),
    onSuccess: () => {
      setPrice('');
      toast.success(t('saveSuccess'));
      invalidateSetup(queryClient, wsId);
    },
  });

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex items-center gap-2 border-border border-b px-3 py-2">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Layers3 className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="truncate font-medium text-sm">{t('batch')}</p>
          <p className="text-muted-foreground text-xs">{batches.length}</p>
        </div>
      </div>
      <form
        className="grid gap-2 p-3 sm:grid-cols-[1fr_1fr_120px_auto]"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          if (warehouseId) createMutation.mutate();
        }}
      >
        <select
          className="h-9 rounded-md border border-border bg-background px-2 text-sm"
          onChange={(event) => setWarehouseId(event.target.value)}
          value={warehouseId}
        >
          <option value="">{t('warehouse')}</option>
          {options?.warehouses.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        <select
          className="h-9 rounded-md border border-border bg-background px-2 text-sm"
          onChange={(event) => setSupplierId(event.target.value)}
          value={supplierId}
        >
          <option value="">{t('supplier')}</option>
          {suppliers.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        <input
          className="h-9 rounded-md border border-border bg-background px-3 text-sm"
          inputMode="numeric"
          onChange={(event) => setPrice(event.target.value)}
          placeholder={t('price')}
          value={price}
        />
        <button
          className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-primary px-3 font-medium text-primary-foreground text-sm disabled:opacity-50"
          disabled={!warehouseId || createMutation.isPending}
          type="submit"
        >
          <Plus className="h-4 w-4" />
          {t('create')}
        </button>
      </form>
      {batches.length ? (
        batches
          .filter((batch): batch is ProductBatch & { id: string } =>
            Boolean(batch.id)
          )
          .map((batch) => <BatchRow batch={batch} key={batch.id} wsId={wsId} />)
      ) : (
        <div className="px-3 pb-3">
          <EmptyRow label={t('emptyResource')} />
        </div>
      )}
    </section>
  );
}

function BatchRow({
  batch,
  wsId,
}: {
  batch: ProductBatch & { id: string };
  wsId: string;
}) {
  const t = useTranslations('inventory.operator.forms');
  const queryClient = useQueryClient();
  const deleteMutation = useMutation({
    mutationFn: () => deleteInventoryBatch(wsId, batch.id),
    onError: () => toast.error(t('deleteError')),
    onSuccess: () => {
      toast.success(t('deleteSuccess'));
      invalidateSetup(queryClient, wsId);
    },
  });

  return (
    <div className="grid gap-2 border-border border-t p-2 text-sm sm:grid-cols-[1fr_auto_auto]">
      <div>
        <p className="font-medium">{batch.warehouse ?? batch.warehouse_id}</p>
        <p className="text-muted-foreground text-xs">
          {batch.supplier ?? batch.id}
        </p>
      </div>
      <span>{batch.price ?? 0}</span>
      <button
        className="inline-flex h-8 items-center justify-center rounded-md border border-destructive/30 px-2 text-destructive disabled:opacity-50"
        disabled={deleteMutation.isPending}
        onClick={() => deleteMutation.mutate()}
        type="button"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

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

  return (
    <div className="grid gap-3">
      <div className="grid gap-3 lg:grid-cols-2">
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
