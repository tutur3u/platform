'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Archive, PackagePlus, Save, Trash2 } from '@tuturuuu/icons';
import type {
  InventoryProductFormOptionsResponse,
  InventoryProductSummary,
} from '@tuturuuu/internal-api/inventory';
import {
  createInventoryProduct,
  deleteInventoryProduct,
  updateInventoryProduct,
  updateInventoryProductInventory,
} from '@tuturuuu/internal-api/inventory';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';

function invalidateProducts(
  queryClient: ReturnType<typeof useQueryClient>,
  wsId: string
) {
  queryClient.invalidateQueries({ queryKey: ['inventory', wsId, 'products'] });
  queryClient.invalidateQueries({ queryKey: ['inventory', wsId, 'overview'] });
}

export function ProductCreateForm({
  options,
  wsId,
}: {
  options?: InventoryProductFormOptionsResponse;
  wsId: string;
}) {
  const t = useTranslations('inventory.operator.forms');
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [manufacturerId, setManufacturerId] = useState('');
  const [unitId, setUnitId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [amount, setAmount] = useState('');
  const [minAmount, setMinAmount] = useState('');
  const [price, setPrice] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      createInventoryProduct(wsId, {
        category_id: categoryId,
        inventory:
          unitId && warehouseId
            ? [
                {
                  amount: Number(amount || 0),
                  min_amount: Number(minAmount || 0),
                  price: Number(price || 0),
                  unit_id: unitId,
                  warehouse_id: warehouseId,
                },
              ]
            : [],
        manufacturer_id: manufacturerId || null,
        name,
        owner_id: ownerId || undefined,
      }),
    onError: () => toast.error(t('saveError')),
    onSuccess: () => {
      setName('');
      setAmount('');
      setMinAmount('');
      setPrice('');
      toast.success(t('saveSuccess'));
      invalidateProducts(queryClient, wsId);
    },
  });

  const canCreate = Boolean(name && categoryId && ownerId);

  return (
    <form
      className="grid gap-2 border-border border-b p-3 lg:grid-cols-[1fr_160px_160px_160px_120px_120px_100px_auto]"
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        if (canCreate) mutation.mutate();
      }}
    >
      <input
        className="h-9 rounded-md border border-border bg-background px-3 text-sm"
        onChange={(event) => setName(event.target.value)}
        placeholder={t('productName')}
        value={name}
      />
      <select
        className="h-9 rounded-md border border-border bg-background px-2 text-sm"
        onChange={(event) => setCategoryId(event.target.value)}
        value={categoryId}
      >
        <option value="">{t('category')}</option>
        {options?.categories.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </select>
      <select
        className="h-9 rounded-md border border-border bg-background px-2 text-sm"
        onChange={(event) => setOwnerId(event.target.value)}
        value={ownerId}
      >
        <option value="">{t('owner')}</option>
        {options?.owners.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </select>
      <select
        className="h-9 rounded-md border border-border bg-background px-2 text-sm"
        onChange={(event) => setManufacturerId(event.target.value)}
        value={manufacturerId}
      >
        <option value="">{t('manufacturer')}</option>
        {options?.manufacturers.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </select>
      <select
        className="h-9 rounded-md border border-border bg-background px-2 text-sm"
        onChange={(event) => setUnitId(event.target.value)}
        value={unitId}
      >
        <option value="">{t('unit')}</option>
        {options?.units.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </select>
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
      <input
        className="h-9 rounded-md border border-border bg-background px-3 text-sm"
        inputMode="numeric"
        onChange={(event) => setAmount(event.target.value)}
        placeholder={t('amount')}
        value={amount}
      />
      <button
        className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-dynamic-blue px-3 font-medium text-dynamic-blue-foreground text-sm disabled:opacity-50"
        disabled={!canCreate || mutation.isPending}
        type="submit"
      >
        <PackagePlus className="h-4 w-4" />
        {t('create')}
      </button>
      <input
        className="h-9 rounded-md border border-border bg-background px-3 text-sm lg:col-start-7"
        inputMode="numeric"
        onChange={(event) => setMinAmount(event.target.value)}
        placeholder={t('minAmount')}
        value={minAmount}
      />
      <input
        className="h-9 rounded-md border border-border bg-background px-3 text-sm"
        inputMode="numeric"
        onChange={(event) => setPrice(event.target.value)}
        placeholder={t('price')}
        value={price}
      />
    </form>
  );
}

export function ProductRowActions({
  row,
  wsId,
}: {
  row: InventoryProductSummary;
  wsId: string;
}) {
  const t = useTranslations('inventory.operator.forms');
  const queryClient = useQueryClient();
  const inventory = row.inventory?.[0] ?? {};
  const [amount, setAmount] = useState(String(inventory.amount ?? 0));
  const [minAmount, setMinAmount] = useState(String(inventory.min_amount ?? 0));
  const [price, setPrice] = useState(String(inventory.price ?? 0));

  const archiveMutation = useMutation({
    mutationFn: () =>
      updateInventoryProduct(wsId, row.id, {
        archived: true,
        category_id: row.category_id ?? '',
        finance_category_id: row.finance_category_id ?? null,
        manufacturer_id: row.manufacturer_id ?? null,
        name: row.name,
        owner_id: row.owner_id ?? row.owner?.id ?? '',
      }),
    onError: () => toast.error(t('saveError')),
    onSuccess: () => {
      toast.success(t('saveSuccess'));
      invalidateProducts(queryClient, wsId);
    },
  });
  const stockMutation = useMutation({
    mutationFn: () =>
      updateInventoryProductInventory(wsId, row.id, {
        inventory: [
          {
            amount: Number(amount || 0),
            min_amount: Number(minAmount || 0),
            price: Number(price || 0),
            unit_id: String(inventory.unit_id ?? ''),
            warehouse_id: String(inventory.warehouse_id ?? ''),
          },
        ],
      }),
    onError: () => toast.error(t('saveError')),
    onSuccess: () => {
      toast.success(t('saveSuccess'));
      invalidateProducts(queryClient, wsId);
    },
  });
  const deleteMutation = useMutation({
    mutationFn: () => deleteInventoryProduct(wsId, row.id),
    onError: () => toast.error(t('deleteError')),
    onSuccess: () => {
      toast.success(t('deleteSuccess'));
      invalidateProducts(queryClient, wsId);
    },
  });
  const canUpdateStock = Boolean(inventory.unit_id && inventory.warehouse_id);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {canUpdateStock ? (
        <>
          <input
            className="h-8 w-20 rounded-md border border-border bg-background px-2 text-sm"
            inputMode="numeric"
            onChange={(event) => setAmount(event.target.value)}
            value={amount}
          />
          <input
            className="h-8 w-20 rounded-md border border-border bg-background px-2 text-sm"
            inputMode="numeric"
            onChange={(event) => setMinAmount(event.target.value)}
            value={minAmount}
          />
          <input
            className="h-8 w-24 rounded-md border border-border bg-background px-2 text-sm"
            inputMode="numeric"
            onChange={(event) => setPrice(event.target.value)}
            value={price}
          />
          <button
            className="inline-flex h-8 items-center justify-center rounded-md border border-border px-2 disabled:opacity-50"
            disabled={stockMutation.isPending}
            onClick={() => stockMutation.mutate()}
            type="button"
          >
            <Save className="h-4 w-4" />
          </button>
        </>
      ) : null}
      <button
        className="inline-flex h-8 items-center justify-center rounded-md border border-border px-2 disabled:opacity-50"
        disabled={
          archiveMutation.isPending ||
          !row.category_id ||
          !(row.owner_id ?? row.owner?.id)
        }
        onClick={() => archiveMutation.mutate()}
        type="button"
      >
        <Archive className="h-4 w-4" />
      </button>
      <button
        className="inline-flex h-8 items-center justify-center rounded-md border border-dynamic-red/30 px-2 text-dynamic-red disabled:opacity-50"
        disabled={deleteMutation.isPending}
        onClick={() => deleteMutation.mutate()}
        type="button"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}
