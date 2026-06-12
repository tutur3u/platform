'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Boxes, PackagePlus, Trash2 } from '@tuturuuu/icons';
import type {
  InventoryBundle,
  InventoryProductSummary,
} from '@tuturuuu/internal-api/inventory';
import { updateInventoryBundle } from '@tuturuuu/internal-api/inventory';
import { Button } from '@tuturuuu/ui/button';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';

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
      stringField(activeInventory, 'unit_id') &&
      stringField(activeInventory, 'warehouse_id')
  );

  if (!bundles.length) return null;

  return (
    <section className="grid gap-3 rounded-lg border border-border bg-background p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-md bg-muted text-muted-foreground">
            <Boxes className="h-4 w-4" />
          </span>
          <div>
            <h3 className="font-semibold text-sm">{t('components')}</h3>
            <p className="text-muted-foreground text-xs">
              {t('bundleComponentsManageDescription')}
            </p>
          </div>
        </div>
      </div>
      <form
        className="grid gap-2 lg:grid-cols-[1fr_1fr_120px_auto]"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          if (!(canAdd && activeBundle)) return;
          const unitId = stringField(activeInventory, 'unit_id');
          const warehouseId = stringField(activeInventory, 'warehouse_id');
          const componentId = `${productId}-${unitId}-${warehouseId}`;
          mutation.mutate([
            ...activeBundle.components.filter(
              (component) => component.id !== componentId
            ),
            {
              bundleId: activeBundle.id,
              id: componentId,
              productName: activeProduct?.name ?? null,
              productId,
              quantity: Number(quantity || 1),
              unitId,
              unitName: stringField(activeInventory, 'unit_name') || null,
              warehouseId,
              warehouseName:
                stringField(activeInventory, 'warehouse_name') || null,
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
        <Button disabled={!canAdd || mutation.isPending} type="submit">
          <PackagePlus className="h-4 w-4" />
          {t('addComponent')}
        </Button>
      </form>
      <div className="grid gap-2">
        {activeBundle?.components.length ? (
          activeBundle.components.map((component) => (
            <div
              className="grid gap-2 rounded-md border border-border bg-muted/20 p-3 text-sm sm:grid-cols-[1fr_auto_auto] sm:items-center"
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
              <Button
                onClick={() =>
                  mutation.mutate(
                    activeBundle.components.filter(
                      (item) => item.id !== component.id
                    )
                  )
                }
                size="sm"
                type="button"
                variant="destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))
        ) : (
          <p className="rounded-md border border-border border-dashed p-4 text-center text-muted-foreground text-sm">
            {t('noBundleComponents')}
          </p>
        )}
      </div>
    </section>
  );
}

function stringField(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === 'string' ? value : '';
}
