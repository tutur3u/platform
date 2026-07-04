'use client';

import { Plus, Trash2 } from '@tuturuuu/icons';
import type {
  InventoryProductSummary,
  InventoryStorefrontListingVariantPayload,
} from '@tuturuuu/internal-api/inventory';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { MoneyInput } from '@tuturuuu/ui/money-input';
import { useTranslations } from 'next-intl';
import { SelectValueField } from './operator-form-fields';

/** A draft option group while editing (values are plain labels). */
export type OptionGroupDraft = {
  name: string;
  values: string[];
};

/** A draft variant while editing. Price is integer minor units or null. */
export type VariantDraft = {
  id?: string;
  sku: string;
  title: string;
  productId: string;
  price: number | null;
  status: 'active' | 'hidden' | 'archived';
  /** group name -> selected value label */
  optionValueLabels: Record<string, string>;
};

/**
 * Resolves the (product, unit, warehouse) stock coordinate for a variant from
 * the selected product's first inventory row — mirroring how the listing create
 * flow derives unit/warehouse. Returns null when the product has no stock row.
 */
export function resolveVariantStockCoordinate(
  products: InventoryProductSummary[],
  productId: string
): { unitId: string; warehouseId: string } | null {
  const product = products.find((item) => item.id === productId);
  const inventory = product?.inventory?.[0] as
    | { unit_id?: unknown; warehouse_id?: unknown }
    | undefined;
  const unitId = inventory?.unit_id ? String(inventory.unit_id) : '';
  const warehouseId = inventory?.warehouse_id
    ? String(inventory.warehouse_id)
    : '';
  if (!unitId || !warehouseId) return null;
  return { unitId, warehouseId };
}

/** Maps editor drafts into the listing payload's options/variants shape. */
export function buildOptionsVariantsPayload(
  products: InventoryProductSummary[],
  options: OptionGroupDraft[],
  variants: VariantDraft[]
): {
  options: Array<{
    name: string;
    sortOrder: number;
    values: Array<{ label: string; sortOrder: number }>;
  }>;
  variants: InventoryStorefrontListingVariantPayload[];
} {
  const cleanOptions = options
    .map((group) => ({
      name: group.name.trim(),
      values: group.values
        .map((label) => label.trim())
        .filter((label) => label.length > 0),
    }))
    .filter((group) => group.name.length > 0 && group.values.length > 0);

  return {
    options: cleanOptions.map((group, groupIndex) => ({
      name: group.name,
      sortOrder: groupIndex,
      values: group.values.map((label, valueIndex) => ({
        label,
        sortOrder: valueIndex,
      })),
    })),
    variants: variants.flatMap((variant, index) => {
      const coordinate = resolveVariantStockCoordinate(
        products,
        variant.productId
      );
      if (!coordinate) return [];
      const optionValueLabels: Record<string, string> = {};
      for (const group of cleanOptions) {
        const label = variant.optionValueLabels[group.name];
        if (label) optionValueLabels[group.name] = label;
      }
      return [
        {
          id: variant.id,
          optionValueLabels,
          price: variant.price,
          productId: variant.productId,
          sku: variant.sku.trim() || null,
          sortOrder: index,
          status: variant.status,
          title: variant.title.trim() || null,
          unitId: coordinate.unitId,
          warehouseId: coordinate.warehouseId,
        },
      ];
    }),
  };
}

export function StorefrontListingOptionsEditor({
  currency,
  onOptionsChange,
  onVariantsChange,
  options,
  products,
  variants,
}: {
  currency: string;
  onOptionsChange: (next: OptionGroupDraft[]) => void;
  onVariantsChange: (next: VariantDraft[]) => void;
  options: OptionGroupDraft[];
  products: InventoryProductSummary[];
  variants: VariantDraft[];
}) {
  const t = useTranslations('inventory.operator.forms');
  const productOptions = products.map((product) => ({
    label: product.name,
    value: product.id,
  }));

  const updateGroup = (index: number, next: Partial<OptionGroupDraft>) => {
    onOptionsChange(
      options.map((group, groupIndex) =>
        groupIndex === index ? { ...group, ...next } : group
      )
    );
  };

  return (
    <div className="grid gap-4">
      {/* Option groups */}
      <div className="grid gap-2">
        <div className="flex items-center justify-between">
          <span className="font-medium text-sm">{t('optionGroups')}</span>
          <Button
            onClick={() =>
              onOptionsChange([...options, { name: '', values: [] }])
            }
            size="sm"
            type="button"
            variant="secondary"
          >
            <Plus className="h-4 w-4" />
            {t('addOptionGroup')}
          </Button>
        </div>
        {options.length === 0 ? (
          <p className="text-muted-foreground text-xs">{t('noOptionGroups')}</p>
        ) : null}
        {options.map((group, index) => (
          <div
            className="grid gap-2 rounded-md border border-border bg-background p-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto] sm:items-end"
            key={`option-${index}`}
          >
            <label className="grid min-w-0 gap-1 text-sm">
              <span className="text-xs">{t('optionGroupName')}</span>
              <Input
                className="h-9"
                onChange={(event) =>
                  updateGroup(index, { name: event.target.value })
                }
                placeholder={t('placeholders.optionGroupName')}
                value={group.name}
              />
            </label>
            <label className="grid min-w-0 gap-1 text-sm">
              <span className="text-xs">{t('optionValues')}</span>
              <Input
                className="h-9"
                onChange={(event) =>
                  updateGroup(index, {
                    values: event.target.value.split(','),
                  })
                }
                placeholder={t('placeholders.optionValues')}
                value={group.values.join(', ')}
              />
            </label>
            <Button
              aria-label={t('remove')}
              className="h-9 w-9 p-0"
              onClick={() =>
                onOptionsChange(options.filter((_, i) => i !== index))
              }
              size="sm"
              type="button"
              variant="ghost"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>

      {/* Variants */}
      <div className="grid gap-2">
        <div className="flex items-center justify-between">
          <span className="font-medium text-sm">{t('variants')}</span>
          <Button
            disabled={options.length === 0}
            onClick={() =>
              onVariantsChange([
                ...variants,
                {
                  optionValueLabels: {},
                  price: null,
                  productId: '',
                  sku: '',
                  status: 'active',
                  title: '',
                },
              ])
            }
            size="sm"
            type="button"
            variant="secondary"
          >
            <Plus className="h-4 w-4" />
            {t('addVariant')}
          </Button>
        </div>
        {variants.length === 0 ? (
          <p className="text-muted-foreground text-xs">{t('noVariants')}</p>
        ) : null}
        {variants.map((variant, index) => {
          const updateVariant = (next: Partial<VariantDraft>) =>
            onVariantsChange(
              variants.map((item, i) =>
                i === index ? { ...item, ...next } : item
              )
            );
          return (
            <div
              className="grid gap-2 rounded-md border border-border bg-background p-2"
              key={`variant-${index}`}
            >
              <div className="grid gap-2 sm:grid-cols-2">
                {options
                  .filter((group) => group.name.trim().length > 0)
                  .map((group) => (
                    <SelectValueField
                      allowEmpty={false}
                      key={group.name}
                      label={group.name}
                      onChange={(label) =>
                        updateVariant({
                          optionValueLabels: {
                            ...variant.optionValueLabels,
                            [group.name]: label,
                          },
                        })
                      }
                      options={group.values
                        .map((label) => label.trim())
                        .filter(Boolean)
                        .map((label) => ({ label, value: label }))}
                      placeholder={t('placeholders.optionValue')}
                      value={variant.optionValueLabels[group.name] ?? ''}
                    />
                  ))}
                <SelectValueField
                  allowEmpty={false}
                  emptyText={t('emptyOptions')}
                  label={t('variantStockProduct')}
                  onChange={(productId) => updateVariant({ productId })}
                  options={productOptions}
                  placeholder={t('placeholders.target')}
                  searchPlaceholder={t('searchOptions', {
                    resource: t('product'),
                  })}
                  value={variant.productId}
                />
                <label className="grid min-w-0 gap-1 text-sm">
                  <span className="text-xs">{t('price')}</span>
                  <MoneyInput
                    className="h-9"
                    currency={currency}
                    hideHelpers
                    onChange={(value) => updateVariant({ price: value })}
                    placeholder={t('placeholders.price')}
                    value={variant.price ?? 0}
                  />
                </label>
                <label className="grid min-w-0 gap-1 text-sm">
                  <span className="text-xs">{t('variantSku')}</span>
                  <Input
                    className="h-9"
                    onChange={(event) =>
                      updateVariant({ sku: event.target.value })
                    }
                    placeholder={t('placeholders.variantSku')}
                    value={variant.sku}
                  />
                </label>
              </div>
              <div className="flex justify-end">
                <Button
                  className="h-8"
                  onClick={() =>
                    onVariantsChange(variants.filter((_, i) => i !== index))
                  }
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  <Trash2 className="h-4 w-4" />
                  {t('remove')}
                </Button>
              </div>
            </div>
          );
        })}
        {variants.some(
          (variant) =>
            variant.productId &&
            !resolveVariantStockCoordinate(products, variant.productId)
        ) ? (
          <p className="text-destructive text-xs">{t('variantNoStock')}</p>
        ) : null}
      </div>
    </div>
  );
}
