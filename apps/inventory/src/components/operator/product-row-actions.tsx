'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Archive, Save, Trash2 } from '@tuturuuu/icons';
import type { InventoryProductSummary } from '@tuturuuu/internal-api/inventory';
import {
  deleteInventoryProduct,
  updateInventoryProduct,
  updateInventoryProductInventory,
} from '@tuturuuu/internal-api/inventory';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

export function invalidateProducts(
  queryClient: ReturnType<typeof useQueryClient>,
  wsId: string
) {
  queryClient.invalidateQueries({ queryKey: ['inventory', wsId, 'products'] });
  queryClient.invalidateQueries({ queryKey: ['inventory', wsId, 'overview'] });
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
        avatar_url: row.avatar_url ?? null,
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
