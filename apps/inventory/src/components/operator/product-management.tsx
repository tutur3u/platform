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
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
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
  const [open, setOpen] = useState(false);

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
      setOpen(false);
      toast.success(t('saveSuccess'));
      invalidateProducts(queryClient, wsId);
    },
  });

  const canCreate = Boolean(name && categoryId && ownerId);

  return (
    <div className="flex justify-end">
      <Dialog onOpenChange={setOpen} open={open}>
        <DialogTrigger asChild>
          <Button type="button">
            <PackagePlus className="h-4 w-4" />
            {t('newProduct')}
          </Button>
        </DialogTrigger>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t('createProductTitle')}</DialogTitle>
            <DialogDescription>
              {t('createProductDescription')}
            </DialogDescription>
          </DialogHeader>
          <form
            className="grid gap-3"
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              if (canCreate) mutation.mutate();
            }}
          >
            <div className="grid gap-3 md:grid-cols-2">
              <label className="grid gap-1 text-sm md:col-span-2">
                <span className="font-medium">{t('productName')}</span>
                <input
                  className="h-10 rounded-md border border-input bg-background px-3"
                  onChange={(event) => setName(event.target.value)}
                  value={name}
                />
              </label>
              <SelectField
                label={t('category')}
                onChange={setCategoryId}
                options={options?.categories}
                value={categoryId}
              />
              <SelectField
                label={t('owner')}
                onChange={setOwnerId}
                options={options?.owners}
                value={ownerId}
              />
              <SelectField
                label={t('manufacturer')}
                onChange={setManufacturerId}
                options={options?.manufacturers}
                value={manufacturerId}
              />
              <SelectField
                label={t('unit')}
                onChange={setUnitId}
                options={options?.units}
                value={unitId}
              />
              <SelectField
                label={t('warehouse')}
                onChange={setWarehouseId}
                options={options?.warehouses}
                value={warehouseId}
              />
              <NumberField
                label={t('amount')}
                onChange={setAmount}
                value={amount}
              />
              <NumberField
                label={t('minAmount')}
                onChange={setMinAmount}
                value={minAmount}
              />
              <NumberField
                label={t('price')}
                onChange={setPrice}
                value={price}
              />
            </div>
            <DialogFooter>
              <Button disabled={!canCreate || mutation.isPending} type="submit">
                {mutation.isPending ? t('creating') : t('create')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SelectField({
  label,
  onChange,
  options = [],
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  options?: { id: string; name?: string | null }[];
  value: string;
}) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="font-medium">{label}</span>
      <select
        className="h-10 rounded-md border border-input bg-background px-3"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        <option value="">{label}</option>
        {options.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name ?? item.id}
          </option>
        ))}
      </select>
    </label>
  );
}

function NumberField({
  label,
  onChange,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="font-medium">{label}</span>
      <input
        className="h-10 rounded-md border border-input bg-background px-3"
        inputMode="numeric"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
    </label>
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
