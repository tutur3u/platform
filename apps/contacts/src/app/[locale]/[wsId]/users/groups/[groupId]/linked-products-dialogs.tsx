'use client';

import { Button } from '@tuturuuu/ui/button';
import { Combobox, type ComboboxOptions } from '@tuturuuu/ui/custom/combobox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import {
  getAvailableUnits,
  getAvailableWarehouses,
  getWarehouseName,
  type LinkedProduct,
  type WarehouseOption,
  type WorkspaceProduct,
} from './use-linked-products';

interface SharedDialogData {
  products: WorkspaceProduct[] | undefined;
  warehouses: WarehouseOption[] | undefined;
  loading: boolean;
}

/** Warehouse + unit cascading selectors shared by the add/edit dialogs. */
function WarehouseUnitSelectors({
  products,
  warehouses,
  productId,
  warehouse,
  unit,
  onWarehouseChange,
  onUnitChange,
}: {
  products: WorkspaceProduct[] | undefined;
  warehouses: WarehouseOption[] | undefined;
  productId: string;
  warehouse: string;
  unit: string;
  onWarehouseChange: (value: string) => void;
  onUnitChange: (value: string) => void;
}) {
  const t = useTranslations();

  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="warehouse-select">
          {t('ws-inventory-warehouses.singular')}
        </Label>
        <Select value={warehouse} onValueChange={onWarehouseChange}>
          <SelectTrigger>
            <SelectValue placeholder={t('ws-groups.select_warehouse')} />
          </SelectTrigger>
          <SelectContent>
            {getAvailableWarehouses(products, productId).map((inventory) => (
              <SelectItem
                key={inventory.warehouse_id}
                value={inventory.warehouse_id}
              >
                {inventory.inventory_warehouses?.name ||
                  getWarehouseName(
                    products,
                    warehouses,
                    productId,
                    inventory.warehouse_id
                  ) ||
                  t('ws-inventory-warehouses.unnamed_warehouse')}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {warehouse && (
        <div className="space-y-2">
          <Label htmlFor="unit-select">
            {t('ws-inventory-units.singular')}
          </Label>
          <Select value={unit} onValueChange={onUnitChange}>
            <SelectTrigger>
              <SelectValue placeholder={t('ws-groups.select_unit')} />
            </SelectTrigger>
            <SelectContent>
              {getAvailableUnits(products, productId, warehouse).map(
                (inventory) => (
                  <SelectItem key={inventory.unit_id} value={inventory.unit_id}>
                    {inventory.inventory_units?.name ||
                      t('ws-inventory-units.unnamed_unit')}
                  </SelectItem>
                )
              )}
            </SelectContent>
          </Select>
        </div>
      )}
    </>
  );
}

export function LinkedProductAddDialog({
  open,
  onOpenChange,
  products,
  warehouses,
  linkedProducts,
  loading,
  onSubmit,
}: SharedDialogData & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  linkedProducts: LinkedProduct[];
  onSubmit: (productId: string, warehouseId: string, unitId: string) => void;
}) {
  const t = useTranslations();
  const [product, setProduct] = useState('');
  const [warehouse, setWarehouse] = useState('');
  const [unit, setUnit] = useState('');

  // Reset selections each time the dialog opens.
  useEffect(() => {
    if (open) {
      setProduct('');
      setWarehouse('');
      setUnit('');
    }
  }, [open]);

  const availableProducts = (products ?? []).filter(
    (p) => !linkedProducts.some((linked) => linked.id === p.id)
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onWheel={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>{t('user-data-table.link_product')}</DialogTitle>
          <DialogDescription>
            {t('user-data-table.link_product_description')}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="product-select">
              {t('ws-inventory-products.singular')}
            </Label>
            <Combobox
              t={t}
              options={availableProducts.map(
                (p): ComboboxOptions => ({
                  value: p.id,
                  label: `${p.name || t('ws-inventory-products.unnamed_product')}${p.manufacturer ? ` - ${p.manufacturer}` : ''}${p.description ? ` (${p.description})` : ''}`,
                })
              )}
              selected={product}
              onChange={(value) => {
                setProduct(value as string);
                setWarehouse('');
                setUnit('');
              }}
              placeholder={t('ws-invoices.search_products')}
            />
          </div>
          {product && (
            <WarehouseUnitSelectors
              products={products}
              warehouses={warehouses}
              productId={product}
              warehouse={warehouse}
              unit={unit}
              onWarehouseChange={(value) => {
                setWarehouse(value);
                setUnit('');
              }}
              onUnitChange={setUnit}
            />
          )}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            {t('ws-settings.cancel')}
          </Button>
          <Button
            onClick={() => onSubmit(product, warehouse, unit)}
            disabled={loading || !product || !warehouse || !unit}
          >
            {loading ? t('ws-groups.linking') : t('ws-groups.link_product')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function LinkedProductEditDialog({
  open,
  onOpenChange,
  product,
  products,
  warehouses,
  loading,
  onSubmit,
}: SharedDialogData & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: LinkedProduct | null;
  onSubmit: (productId: string, warehouseId: string, unitId: string) => void;
}) {
  const t = useTranslations();
  const [warehouse, setWarehouse] = useState('');
  const [unit, setUnit] = useState('');

  // Seed selectors from the product being edited whenever it changes.
  useEffect(() => {
    setWarehouse(product?.warehouse_id || '');
    setUnit(product?.unit_id || '');
  }, [product]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onWheel={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>{t('ws-groups.edit_linked_product')}</DialogTitle>
          <DialogDescription>
            {t('ws-groups.update_warehouse_and_unit')}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>{t('ws-inventory-products.singular')}</Label>
            <div className="text-sm">{product?.name}</div>
          </div>
          <WarehouseUnitSelectors
            products={products}
            warehouses={warehouses}
            productId={product?.id ?? ''}
            warehouse={warehouse}
            unit={unit}
            onWarehouseChange={(value) => {
              setWarehouse(value);
              setUnit('');
            }}
            onUnitChange={setUnit}
          />
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            {t('ws-settings.cancel')}
          </Button>
          <Button
            onClick={() => {
              if (product) onSubmit(product.id, warehouse, unit);
            }}
            disabled={loading || !warehouse || !unit}
          >
            {loading ? t('ws-groups.saving') : t('ws-groups.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function LinkedProductDeleteDialog({
  open,
  onOpenChange,
  product,
  loading,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: LinkedProduct | null;
  loading: boolean;
  onConfirm: () => void;
}) {
  const t = useTranslations();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('ws-groups.remove_linked_product')}</DialogTitle>
          <DialogDescription>
            {t('ws-groups.confirm_remove_product', {
              productName: product?.name ?? 'this product',
            })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            {t('ws-settings.cancel')}
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={loading}>
            {loading ? t('ws-groups.removing') : t('ws-groups.remove')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
