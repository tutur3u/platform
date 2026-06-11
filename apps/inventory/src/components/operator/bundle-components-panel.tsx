'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from '@tuturuuu/icons';
import type {
  InventoryBundle,
  InventoryProductSummary,
} from '@tuturuuu/internal-api/inventory';
import { updateInventoryBundle } from '@tuturuuu/internal-api/inventory';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import { EmptyRow } from './operator-shell';

export function BundleComponentsPanel({
  bundles,
  products,
  wsId,
}: {
  bundles: InventoryBundle[];
  products: InventoryProductSummary[];
  wsId: string;
}) {
  const t = useTranslations('inventory.operator.forms');
  const queryClient = useQueryClient();
  const [bundleId, setBundleId] = useState('');
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const activeBundle = bundles.find(
    (bundle) => bundle.id === (bundleId || bundles[0]?.id)
  );
  const activeProduct = products.find((product) => product.id === productId);
  const activeInventory = activeProduct?.inventory?.[0] ?? {};
  const mutation = useMutation({
    mutationFn: (components: NonNullable<InventoryBundle['components']>) =>
      activeBundle
        ? updateInventoryBundle(wsId, activeBundle.id, {
            components: components.map((component) => ({
              productId: component.productId,
              quantity: component.quantity,
              unitId: component.unitId,
              warehouseId: component.warehouseId,
            })),
          })
        : Promise.resolve(null),
    onError: () => toast.error(t('saveError')),
    onSuccess: () => {
      setProductId('');
      setQuantity('1');
      toast.success(t('saveSuccess'));
      queryClient.invalidateQueries({ queryKey: ['inventory', wsId] });
    },
  });
  const canAdd = Boolean(
    activeBundle &&
      productId &&
      activeInventory.unit_id &&
      activeInventory.warehouse_id
  );

  if (!bundles.length) return <EmptyRow label={t('emptyResource')} />;

  return (
    <section className="border-border border-t">
      <form
        className="grid gap-2 p-3 lg:grid-cols-[1fr_1fr_120px_auto]"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          if (!(canAdd && activeBundle)) return;
          mutation.mutate([
            ...activeBundle.components,
            {
              bundleId: activeBundle.id,
              id: `${productId}-${activeInventory.unit_id}-${activeInventory.warehouse_id}`,
              productId,
              quantity: Number(quantity || 1),
              unitId: String(activeInventory.unit_id),
              warehouseId: String(activeInventory.warehouse_id),
            },
          ]);
        }}
      >
        <select
          className="h-9 rounded-md border border-border bg-background px-2 text-sm"
          onChange={(event) => setBundleId(event.target.value)}
          value={activeBundle?.id ?? ''}
        >
          {bundles.map((bundle) => (
            <option key={bundle.id} value={bundle.id}>
              {bundle.name}
            </option>
          ))}
        </select>
        <select
          className="h-9 rounded-md border border-border bg-background px-2 text-sm"
          onChange={(event) => setProductId(event.target.value)}
          value={productId}
        >
          <option value="">{t('product')}</option>
          {products.map((product) => (
            <option key={product.id} value={product.id}>
              {product.name}
            </option>
          ))}
        </select>
        <input
          className="h-9 rounded-md border border-border bg-background px-3 text-sm"
          inputMode="numeric"
          onChange={(event) => setQuantity(event.target.value)}
          placeholder={t('quantity')}
          value={quantity}
        />
        <button
          className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-dynamic-blue px-3 font-medium text-dynamic-blue-foreground text-sm disabled:opacity-50"
          disabled={!canAdd || mutation.isPending}
          type="submit"
        >
          <Plus className="h-4 w-4" />
          {t('create')}
        </button>
      </form>
      <div className="divide-y divide-border">
        {activeBundle?.components.length ? (
          activeBundle.components.map((component) => (
            <div
              className="grid gap-2 p-3 text-sm sm:grid-cols-[1fr_auto_auto] sm:items-center"
              key={component.id}
            >
              <div>
                <p className="font-medium">
                  {component.productName ?? component.productId}
                </p>
                <p className="text-muted-foreground text-xs">
                  {component.unitName ?? component.unitId} /{' '}
                  {component.warehouseName ?? component.warehouseId}
                </p>
              </div>
              <span>{component.quantity}</span>
              <button
                className="inline-flex h-8 items-center justify-center rounded-md border border-dynamic-red/30 px-2 text-dynamic-red"
                onClick={() =>
                  mutation.mutate(
                    activeBundle.components.filter(
                      (item) => item.id !== component.id
                    )
                  )
                }
                type="button"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))
        ) : (
          <EmptyRow label={t('emptyResource')} />
        )}
      </div>
    </section>
  );
}
