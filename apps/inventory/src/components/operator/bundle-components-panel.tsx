'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Boxes, PackagePlus, Settings2, Trash2 } from '@tuturuuu/icons';
import type {
  InventoryBundle,
  InventoryProductSummary,
} from '@tuturuuu/internal-api/inventory';
import { updateInventoryBundle } from '@tuturuuu/internal-api/inventory';
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
import { Input } from '@tuturuuu/ui/input';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import { operatorDialogContentClassName } from './operator-dialog';
import { SelectField } from './operator-form-fields';

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

  if (!bundles.length) return null;

  return (
    <section className="grid min-w-0 gap-3 rounded-lg border border-border bg-background p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
            <Boxes className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h3 className="truncate font-semibold text-sm">
              {t('components')}
            </h3>
            <p className="text-muted-foreground text-xs">
              {t('bundleComponentsManageDescription')}
            </p>
          </div>
        </div>
      </div>
      <div className="grid min-w-0 gap-2">
        {bundles.map((bundle) => (
          <div
            className="grid min-w-0 gap-2 rounded-md border border-border bg-card p-3 text-sm sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
            key={bundle.id}
          >
            <div className="min-w-0">
              <p className="truncate font-medium">{bundle.name}</p>
              <p className="text-muted-foreground text-xs">
                {t('componentCount', {
                  count: bundle.components.length,
                })}
              </p>
            </div>
            <BundleComponentsDialog
              bundle={bundle}
              products={products}
              wsId={wsId}
            />
          </div>
        ))}
      </div>
    </section>
  );
}

function BundleComponentsDialog({
  bundle,
  products,
  wsId,
}: {
  bundle: InventoryBundle;
  products: InventoryProductSummary[];
  wsId: string;
}) {
  const t = useTranslations('inventory.operator.forms');
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const activeProduct = products.find((product) => product.id === productId);
  const activeInventory = activeProduct?.inventory?.[0] ?? {};
  const mutation = useMutation({
    mutationFn: (components: NonNullable<InventoryBundle['components']>) =>
      updateInventoryBundle(wsId, bundle.id, {
        components: components.map((component) => ({
          productId: component.productId,
          quantity: component.quantity,
          unitId: component.unitId,
          warehouseId: component.warehouseId,
        })),
      }),
    onError: () => toast.error(t('saveError')),
    onSuccess: () => {
      setProductId('');
      setQuantity('1');
      toast.success(t('saveSuccess'));
      queryClient.invalidateQueries({ queryKey: ['inventory', wsId] });
    },
  });
  const canAdd = Boolean(
    productId &&
      stringField(activeInventory, 'unit_id') &&
      stringField(activeInventory, 'warehouse_id')
  );

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        <Button size="sm" type="button" variant="outline">
          <Settings2 className="h-4 w-4" />
          {t('manageComponents')}
        </Button>
      </DialogTrigger>
      <DialogContent className={operatorDialogContentClassName('workflow')}>
        <DialogHeader>
          <DialogTitle>{t('manageComponentsTitle')}</DialogTitle>
          <DialogDescription>
            {t('bundleComponentsManageDescription')}
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid min-w-0 gap-3"
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            if (!canAdd) return;
            const unitId = stringField(activeInventory, 'unit_id');
            const warehouseId = stringField(activeInventory, 'warehouse_id');
            const componentId = `${productId}-${unitId}-${warehouseId}`;
            mutation.mutate([
              ...bundle.components.filter(
                (component) => component.id !== componentId
              ),
              {
                bundleId: bundle.id,
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
          <div className="grid min-w-0 gap-2 md:grid-cols-[minmax(0,1fr)_120px_auto]">
            <SelectField
              className="gap-0"
              emptyText={t('emptyOptions')}
              label={t('product')}
              onChange={setProductId}
              options={products}
              placeholder={t('placeholders.product')}
              searchPlaceholder={t('searchOptions', {
                resource: t('product'),
              })}
              value={productId}
            />
            <Input
              inputMode="numeric"
              onChange={(event) => setQuantity(event.target.value)}
              placeholder={t('placeholders.quantity')}
              value={quantity}
            />
            <Button disabled={!canAdd || mutation.isPending} type="submit">
              <PackagePlus className="h-4 w-4" />
              {t('addComponent')}
            </Button>
          </div>
        </form>
        <div className="grid min-w-0 gap-2">
          {bundle.components.length ? (
            bundle.components.map((component) => (
              <div
                className="grid min-w-0 gap-2 rounded-md border border-border bg-muted/20 p-3 text-sm sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center"
                key={component.id}
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {component.productName ?? component.productId}
                  </p>
                  <p className="truncate text-muted-foreground text-xs">
                    {component.unitName ?? component.unitId} /{' '}
                    {component.warehouseName ?? component.warehouseId}
                  </p>
                </div>
                <span>{component.quantity}</span>
                <Button
                  disabled={mutation.isPending}
                  onClick={() =>
                    mutation.mutate(
                      bundle.components.filter(
                        (item) => item.id !== component.id
                      )
                    )
                  }
                  size="icon"
                  type="button"
                  variant="destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))
          ) : (
            <p className="rounded-md border border-border border-dashed p-4 text-center text-muted-foreground text-sm">
              {products.length
                ? t('noBundleComponents')
                : t('noBundleProducts')}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button onClick={() => setOpen(false)} type="button">
            {t('save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function stringField(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === 'string' ? value : '';
}
