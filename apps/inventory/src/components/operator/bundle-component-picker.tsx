'use client';

import { PackagePlus, Trash2 } from '@tuturuuu/icons';
import type {
  InventoryBundleCategoryComponent,
  InventoryBundleComponent,
  InventoryProductSummary,
} from '@tuturuuu/internal-api/inventory';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { SelectField } from './operator-form-fields';

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

export type DraftBundleCategoryComponent = Pick<
  InventoryBundleCategoryComponent,
  'categoryId' | 'discountStrategy' | 'freeQuantity' | 'quantityRequired'
> & {
  categoryName?: string | null;
  id: string;
  sortOrder?: number;
};

export function BundleComponentPicker({
  categories = [],
  categoryComponents = [],
  components,
  onCategoryComponentsChange,
  onChange,
  products,
}: {
  categories?: { id: string; name?: string | null }[];
  categoryComponents?: DraftBundleCategoryComponent[];
  components: DraftBundleComponent[];
  onCategoryComponentsChange?: (
    components: DraftBundleCategoryComponent[]
  ) => void;
  onChange: (components: DraftBundleComponent[]) => void;
  products: InventoryProductSummary[];
}) {
  const t = useTranslations('inventory.operator.forms');
  const [categoryId, setCategoryId] = useState('');
  const [freeQuantity, setFreeQuantity] = useState('1');
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [quantityRequired, setQuantityRequired] = useState('3');
  const [stockKey, setStockKey] = useState('');
  const selectedProduct = products.find((product) => product.id === productId);
  const stockOptions =
    selectedProduct?.inventory?.flatMap((inventory, index) => {
      const key = createStockKey(inventory, index);
      if (!key) return [];

      return [
        {
          id: key,
          name: [
            stringField(inventory, 'warehouse_name') ||
              stringField(inventory, 'warehouse_id'),
            stringField(inventory, 'unit_name') ||
              stringField(inventory, 'unit_id'),
            numberField(inventory, 'price') > 0
              ? String(numberField(inventory, 'price'))
              : null,
          ]
            .filter(Boolean)
            .join(' / '),
        },
      ];
    }) ?? [];
  const selectedInventory =
    selectedProduct?.inventory?.find(
      (inventory, index) => createStockKey(inventory, index) === stockKey
    ) ?? null;
  const selectedUnitId = stringField(selectedInventory, 'unit_id');
  const selectedWarehouseId = stringField(selectedInventory, 'warehouse_id');
  const canAddComponent = Boolean(
    selectedProduct && selectedUnitId && selectedWarehouseId
  );
  const selectedCategory = categories.find(
    (category) => category.id === categoryId
  );
  const canAddCategoryComponent = Boolean(
    onCategoryComponentsChange &&
      selectedCategory &&
      Number(quantityRequired) > 0
  );

  return (
    <div className="grid gap-4 rounded-lg border border-border bg-muted/20 p-3">
      <div className="grid gap-2">
        <p className="font-medium text-sm">{t('fixedStockMode')}</p>
        <div className="grid min-w-0 gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_120px_auto]">
          <SelectField
            className="gap-0"
            emptyText={t('emptyOptions')}
            label={t('product')}
            onChange={(nextProductId) => {
              setProductId(nextProductId);
              setStockKey('');
            }}
            options={products}
            placeholder={t('placeholders.product')}
            searchPlaceholder={t('searchOptions', { resource: t('product') })}
            value={productId}
          />
          <SelectField
            allowEmpty={false}
            className="gap-0"
            emptyText={t('emptyStockRows')}
            label={t('stockRow')}
            onChange={setStockKey}
            options={stockOptions}
            placeholder={t('placeholders.stockRow')}
            searchPlaceholder={t('searchOptions', { resource: t('stockRow') })}
            value={stockKey}
          />
          <Input
            className="h-10"
            inputMode="numeric"
            onChange={(event) => setQuantity(event.target.value)}
            placeholder={t('placeholders.quantity')}
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
                  warehouseName: stringField(
                    selectedInventory,
                    'warehouse_name'
                  ),
                },
              ]);
              setProductId('');
              setStockKey('');
              setQuantity('1');
            }}
            type="button"
          >
            <PackagePlus className="h-4 w-4" />
            {t('addComponent')}
          </Button>
        </div>
      </div>
      {onCategoryComponentsChange ? (
        <div className="grid gap-2 border-border border-t pt-4">
          <p className="font-medium text-sm">{t('categoryChoiceMode')}</p>
          <div className="grid min-w-0 gap-2 md:grid-cols-[minmax(0,1fr)_120px_120px_auto]">
            <SelectField
              className="gap-0"
              emptyText={t('emptyOptions')}
              label={t('category')}
              onChange={setCategoryId}
              options={categories}
              placeholder={t('placeholders.category')}
              searchPlaceholder={t('searchOptions', {
                resource: t('category'),
              })}
              value={categoryId}
            />
            <Input
              className="h-10"
              inputMode="numeric"
              onChange={(event) => setQuantityRequired(event.target.value)}
              placeholder={t('placeholders.quantityRequired')}
              value={quantityRequired}
            />
            <Input
              className="h-10"
              inputMode="numeric"
              onChange={(event) => setFreeQuantity(event.target.value)}
              placeholder={t('placeholders.freeQuantity')}
              value={freeQuantity}
            />
            <Button
              disabled={!canAddCategoryComponent}
              onClick={() => {
                if (!selectedCategory || !canAddCategoryComponent) return;
                const id = `category:${selectedCategory.id}`;
                onCategoryComponentsChange([
                  ...categoryComponents.filter((item) => item.id !== id),
                  {
                    categoryId: selectedCategory.id,
                    categoryName: selectedCategory.name,
                    discountStrategy: 'cheapest_free',
                    freeQuantity: Number(freeQuantity || 0),
                    id,
                    quantityRequired: Number(quantityRequired || 1),
                    sortOrder: categoryComponents.length,
                  },
                ]);
                setCategoryId('');
                setQuantityRequired('3');
                setFreeQuantity('1');
              }}
              type="button"
            >
              <PackagePlus className="h-4 w-4" />
              {t('addCategoryComponent')}
            </Button>
          </div>
        </div>
      ) : null}
      <div className="grid gap-2">
        {components.map((component) => (
          <div
            className="grid min-w-0 gap-2 rounded-md bg-background p-3 text-sm sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center"
            key={component.id}
          >
            <div className="min-w-0">
              <p className="truncate font-medium">{component.productName}</p>
              <p className="truncate text-muted-foreground text-xs">
                {component.unitName || component.unitId} /{' '}
                {component.warehouseName || component.warehouseId}
              </p>
            </div>
            <span>{component.quantity}</span>
            <Button
              onClick={() =>
                onChange(components.filter((item) => item.id !== component.id))
              }
              size="sm"
              type="button"
              variant="destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        {categoryComponents.map((component) => (
          <div
            className="grid min-w-0 gap-2 rounded-md bg-background p-3 text-sm sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center"
            key={component.id}
          >
            <div className="min-w-0">
              <p className="truncate font-medium">
                {component.categoryName || component.categoryId}
              </p>
              <p className="truncate text-muted-foreground text-xs">
                {t('categoryBundleSummary', {
                  free: component.freeQuantity,
                  required: component.quantityRequired,
                })}
              </p>
            </div>
            <span>{component.discountStrategy.replaceAll('_', ' ')}</span>
            <Button
              onClick={() =>
                onCategoryComponentsChange?.(
                  categoryComponents.filter((item) => item.id !== component.id)
                )
              }
              size="sm"
              type="button"
              variant="destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        {components.length === 0 && categoryComponents.length === 0 ? (
          <p className="rounded-md border border-border border-dashed p-4 text-center text-muted-foreground text-sm">
            {products.length || categories.length
              ? t('noBundleComponents')
              : t('noBundleProducts')}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function createStockKey(record: Record<string, unknown> | null, index: number) {
  const unitId = stringField(record, 'unit_id');
  const warehouseId = stringField(record, 'warehouse_id');
  return unitId && warehouseId ? `${warehouseId}:${unitId}:${index}` : '';
}

function stringField(record: Record<string, unknown> | null, key: string) {
  const value = record?.[key];
  return typeof value === 'string' ? value : '';
}

function numberField(record: Record<string, unknown> | null, key: string) {
  const value = record?.[key];
  return typeof value === 'number' ? value : Number(value || 0);
}
