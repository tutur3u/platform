'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Boxes,
  Building2,
  Loader2,
  SlidersHorizontal,
  User,
} from '@tuturuuu/icons';
import type {
  InventoryProductFormOptionsResponse,
  InventoryProductInventoryItem,
} from '@tuturuuu/internal-api/inventory';
import {
  updateInventoryProduct,
  updateInventoryProductInventory,
} from '@tuturuuu/internal-api/inventory';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import { Dialog, DialogClose, DialogTrigger } from '@tuturuuu/ui/dialog';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  OperatorDialogContent,
  OperatorDialogFooter,
  OperatorDialogHeader,
  OperatorDialogTabs,
} from './operator-dialog-shell';
import { NumberField, SelectField, ToggleField } from './operator-form-fields';
import {
  buildBulkInventoryUpdates,
  type ProductBulkChanges,
  type ProductBulkSelection,
} from './product-bulk-update';
import { invalidateProducts } from './product-row-actions';

export type { ProductBulkSelection } from './product-bulk-update';

export function ProductBulkToolbar({
  allSelected,
  formOptions,
  onClear,
  onSelectAll,
  selections,
  totalCount,
  view,
  wsId,
}: {
  allSelected: boolean;
  formOptions?: InventoryProductFormOptionsResponse;
  onClear: () => void;
  onSelectAll: (selected: boolean) => void;
  selections: ProductBulkSelection[];
  totalCount: number;
  view: string;
  wsId: string;
}) {
  const t = useTranslations('inventory.operator.productBulk');

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed bg-muted/20 px-3 py-2">
      <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
        <Checkbox
          checked={
            allSelected ? true : selections.length > 0 ? 'indeterminate' : false
          }
          onCheckedChange={(checked) => onSelectAll(Boolean(checked))}
        />
        {t('selectAll', { count: totalCount })}
      </label>
      <div className="flex flex-wrap items-center gap-2">
        {selections.length > 0 ? (
          <Badge variant="outline">
            {t('selected', { count: selections.length })}
          </Badge>
        ) : null}
        {selections.length > 0 ? (
          <Button onClick={onClear} size="sm" type="button" variant="ghost">
            {t('clear')}
          </Button>
        ) : null}
        <ProductBulkEditDialog
          formOptions={formOptions}
          onComplete={onClear}
          selections={selections}
          view={view}
          wsId={wsId}
        />
      </div>
    </div>
  );
}

function ProductBulkEditDialog({
  formOptions,
  onComplete,
  selections,
  view,
  wsId,
}: {
  formOptions?: InventoryProductFormOptionsResponse;
  onComplete: () => void;
  selections: ProductBulkSelection[];
  view: string;
  wsId: string;
}) {
  const t = useTranslations('inventory.operator.productBulk');
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState(
    view === 'stock' ? 'stock' : 'owner'
  );
  const [changeOwner, setChangeOwner] = useState(false);
  const [ownerId, setOwnerId] = useState('');
  const [changeQuantity, setChangeQuantity] = useState(false);
  const [quantity, setQuantity] = useState('');
  const [unlimitedStock, setUnlimitedStock] = useState(false);
  const [changeWarehouse, setChangeWarehouse] = useState(false);
  const [warehouseId, setWarehouseId] = useState('');
  const stockSelections = selections.filter(
    (selection) => selection.inventoryIndex != null
  );
  const quantityValue = Number(quantity);
  const hasValidQuantity =
    unlimitedStock ||
    (quantity.trim().length > 0 &&
      Number.isFinite(quantityValue) &&
      quantityValue >= 0);
  const hasOwnerChange = changeOwner && Boolean(ownerId);
  const hasQuantityChange =
    view === 'stock' &&
    stockSelections.length > 0 &&
    changeQuantity &&
    hasValidQuantity;
  const hasWarehouseChange =
    view === 'stock' &&
    stockSelections.length > 0 &&
    changeWarehouse &&
    Boolean(warehouseId);
  const canApply =
    selections.length > 0 &&
    (hasOwnerChange || hasQuantityChange || hasWarehouseChange);
  const resetChanges = () => {
    setActiveTab(view === 'stock' ? 'stock' : 'owner');
    setChangeOwner(false);
    setOwnerId('');
    setChangeQuantity(false);
    setQuantity('');
    setUnlimitedStock(false);
    setChangeWarehouse(false);
    setWarehouseId('');
  };
  const mutation = useMutation({
    mutationFn: async () => {
      const changes: ProductBulkChanges = {
        ...(hasOwnerChange ? { ownerId } : {}),
        ...(hasQuantityChange
          ? { amount: unlimitedStock ? null : quantityValue }
          : {}),
        ...(hasWarehouseChange ? { warehouseId } : {}),
      };
      const inventoryUpdates =
        hasQuantityChange || hasWarehouseChange
          ? buildBulkInventoryUpdates(selections, changes)
          : new Map<string, InventoryProductInventoryItem[]>();
      const productIds = [
        ...new Set(selections.map((selection) => selection.product.id)),
      ];

      await runInBatches(productIds, 4, async (productId) => {
        if (changes.ownerId) {
          await updateInventoryProduct(wsId, productId, {
            owner_id: changes.ownerId,
          });
        }

        const inventory = inventoryUpdates.get(productId);
        if (inventory) {
          await updateInventoryProductInventory(wsId, productId, {
            changeContext: { note: t('stockChangeNote') },
            inventory,
          });
        }
      });

      return productIds.length;
    },
    onError: (error) => {
      toast.error(
        error instanceof Error && error.message === 'duplicate_stock_target'
          ? t('duplicateTargetError')
          : t('updateError')
      );
    },
    onSuccess: (count) => {
      toast.success(t('updateSuccess', { count }));
      invalidateProducts(queryClient, wsId);
      onComplete();
      setOpen(false);
    },
  });

  const stockTab = {
    content: (
      <div className="grid gap-5">
        <div className="rounded-lg border bg-muted/20 p-3 text-sm">
          <p className="font-medium">{t('stockScopeTitle')}</p>
          <p className="mt-1 text-muted-foreground leading-6">
            {t('stockScopeDescription', { count: stockSelections.length })}
          </p>
        </div>
        <ToggleField checked={changeQuantity} onChange={setChangeQuantity}>
          <span className="grid gap-1">
            <span className="font-medium">{t('quantityToggle')}</span>
            <span className="text-muted-foreground text-xs">
              {t('quantityToggleDescription')}
            </span>
          </span>
        </ToggleField>
        {changeQuantity ? (
          <div className="grid gap-3 rounded-lg border p-3">
            <ToggleField checked={unlimitedStock} onChange={setUnlimitedStock}>
              <span className="grid gap-1">
                <span className="font-medium">{t('unlimited')}</span>
                <span className="text-muted-foreground text-xs">
                  {t('unlimitedDescription')}
                </span>
              </span>
            </ToggleField>
            <NumberField
              disabled={unlimitedStock}
              label={t('quantity')}
              onChange={setQuantity}
              placeholder={
                unlimitedStock ? t('unlimited') : t('quantityPlaceholder')
              }
              value={quantity}
            />
          </div>
        ) : null}
        <ToggleField checked={changeWarehouse} onChange={setChangeWarehouse}>
          <span className="grid gap-1">
            <span className="font-medium">{t('warehouseToggle')}</span>
            <span className="text-muted-foreground text-xs">
              {t('warehouseToggleDescription')}
            </span>
          </span>
        </ToggleField>
        {changeWarehouse ? (
          <SelectField
            allowEmpty={false}
            emptyText={t('emptyWarehouses')}
            label={t('warehouse')}
            onChange={setWarehouseId}
            options={formOptions?.warehouses}
            placeholder={t('chooseWarehouse')}
            searchPlaceholder={t('searchWarehouses')}
            value={warehouseId}
          />
        ) : null}
      </div>
    ),
    icon: <Boxes className="h-4 w-4" />,
    label: t('stockTab'),
    value: 'stock',
  };
  const ownerTab = {
    content: (
      <div className="grid gap-5">
        <ToggleField checked={changeOwner} onChange={setChangeOwner}>
          <span className="grid gap-1">
            <span className="font-medium">{t('ownerToggle')}</span>
            <span className="text-muted-foreground text-xs">
              {t('ownerToggleDescription')}
            </span>
          </span>
        </ToggleField>
        {changeOwner ? (
          <SelectField
            allowEmpty={false}
            emptyText={t('emptyOwners')}
            label={t('owner')}
            onChange={setOwnerId}
            options={formOptions?.owners}
            placeholder={t('chooseOwner')}
            searchPlaceholder={t('searchOwners')}
            value={ownerId}
          />
        ) : null}
      </div>
    ),
    icon: <User className="h-4 w-4" />,
    label: t('ownerTab'),
    value: 'owner',
  };

  return (
    <Dialog
      onOpenChange={(nextOpen) => {
        if (nextOpen) resetChanges();
        setOpen(nextOpen);
      }}
      open={open}
    >
      <DialogTrigger asChild>
        <Button disabled={selections.length === 0} size="sm" type="button">
          <SlidersHorizontal className="h-4 w-4" />
          {t('edit')}
        </Button>
      </DialogTrigger>
      <OperatorDialogContent size="md">
        <OperatorDialogHeader
          description={t('description', { count: selections.length })}
          title={t('title')}
        />
        <OperatorDialogTabs
          onValueChange={setActiveTab}
          tabs={view === 'stock' ? [stockTab, ownerTab] : [ownerTab]}
          value={activeTab}
        />
        <OperatorDialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="ghost">
              {t('cancel')}
            </Button>
          </DialogClose>
          <Button
            disabled={!canApply || mutation.isPending}
            onClick={() => mutation.mutate()}
            type="button"
          >
            {mutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Building2 className="h-4 w-4" />
            )}
            {mutation.isPending ? t('updating') : t('apply')}
          </Button>
        </OperatorDialogFooter>
      </OperatorDialogContent>
    </Dialog>
  );
}

async function runInBatches<T>(
  items: T[],
  size: number,
  task: (item: T) => Promise<void>
) {
  for (let index = 0; index < items.length; index += size) {
    await Promise.all(items.slice(index, index + size).map(task));
  }
}
