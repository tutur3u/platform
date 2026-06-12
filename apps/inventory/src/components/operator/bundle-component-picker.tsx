'use client';

import { PackagePlus, Trash2 } from '@tuturuuu/icons';
import type {
  InventoryBundleComponent,
  InventoryProductSummary,
} from '@tuturuuu/internal-api/inventory';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

export type DraftBundleComponent = Pick<
  InventoryBundleComponent,
  'productId' | 'quantity' | 'unitId' | 'warehouseId'
> & {
  id: string;
  productName: string;
  unitName?: string | null;
  unitPrice: number;
  warehouseName?: string | null;
};

export function BundleComponentPicker({
  components,
  onChange,
  products,
}: {
  components: DraftBundleComponent[];
  onChange: (components: DraftBundleComponent[]) => void;
  products: InventoryProductSummary[];
}) {
  const t = useTranslations('inventory.operator.forms');
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const selectedProduct = products.find((product) => product.id === productId);
  const selectedInventory = selectedProduct?.inventory?.[0] ?? null;
  const selectedUnitId = stringField(selectedInventory, 'unit_id');
  const selectedWarehouseId = stringField(selectedInventory, 'warehouse_id');
  const canAddComponent = Boolean(
    selectedProduct && selectedUnitId && selectedWarehouseId
  );

  return (
    <div className="grid gap-3 rounded-lg border border-border bg-muted/20 p-3">
      <div className="grid gap-2 md:grid-cols-[1fr_120px_auto]">
        <select
          className="h-10 rounded-md border border-input bg-background px-3"
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
          className="h-10 rounded-md border border-input bg-background px-3"
          inputMode="numeric"
          onChange={(event) => setQuantity(event.target.value)}
          value={quantity}
        />
        <Button
          disabled={!canAddComponent}
          onClick={() => {
            if (!selectedProduct || !selectedInventory || !canAddComponent) {
              return;
            }
            const id = `${selectedProduct.id}-${selectedUnitId}-${selectedWarehouseId}`;
            onChange([
              ...components.filter((item) => item.id !== id),
              {
                id,
                productId: selectedProduct.id,
                productName: selectedProduct.name,
                quantity: Number(quantity || 1),
                unitId: selectedUnitId,
                unitName: stringField(selectedInventory, 'unit_name'),
                unitPrice: numberField(selectedInventory, 'price'),
                warehouseId: selectedWarehouseId,
                warehouseName: stringField(selectedInventory, 'warehouse_name'),
              },
            ]);
            setProductId('');
            setQuantity('1');
          }}
          type="button"
        >
          <PackagePlus className="h-4 w-4" />
          {t('addComponent')}
        </Button>
      </div>
      <div className="grid gap-2">
        {components.length ? (
          components.map((component) => (
            <div
              className="grid gap-2 rounded-md bg-background p-3 text-sm sm:grid-cols-[1fr_auto_auto] sm:items-center"
              key={component.id}
            >
              <div>
                <p className="font-medium">{component.productName}</p>
                <p className="text-muted-foreground text-xs">
                  {component.unitName || component.unitId} /{' '}
                  {component.warehouseName || component.warehouseId}
                </p>
              </div>
              <span>{component.quantity}</span>
              <Button
                onClick={() =>
                  onChange(
                    components.filter((item) => item.id !== component.id)
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
            {products.length ? t('noBundleComponents') : t('noBundleProducts')}
          </p>
        )}
      </div>
    </div>
  );
}

function stringField(record: Record<string, unknown> | null, key: string) {
  const value = record?.[key];
  return typeof value === 'string' ? value : '';
}

function numberField(record: Record<string, unknown> | null, key: string) {
  const value = record?.[key];
  return typeof value === 'number' ? value : Number(value || 0);
}
