'use client';

import type { InventoryProductFormOptionsResponse } from '@tuturuuu/internal-api/inventory';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import type { ProductFormState } from './product-form-types';
import type { SmartSuggestion } from './smart-suggestions';

export function useProductSuggestions(
  form: ProductFormState,
  setForm: (update: (current: ProductFormState) => ProductFormState) => void,
  options?: InventoryProductFormOptionsResponse
) {
  const t = useTranslations('inventory.operator.forms');

  return useMemo<SmartSuggestion[]>(() => {
    const suggestions: SmartSuggestion[] = [];
    const category = options?.categories[0];
    const owner = options?.owners[0];
    const unit = options?.units[0];
    const warehouse = options?.warehouses[0];

    if (!form.categoryId && options?.categories.length === 1 && category) {
      suggestions.push({
        actionLabel: t('suggestions.apply'),
        description: t('suggestions.singleCategoryDescription'),
        key: 'category',
        onApply: () =>
          setForm((current) => ({ ...current, categoryId: category.id })),
        title: t('suggestions.singleCategoryTitle'),
      });
    }
    if (!form.ownerId && options?.owners.length === 1 && owner) {
      suggestions.push({
        actionLabel: t('suggestions.apply'),
        description: t('suggestions.singleOwnerDescription'),
        key: 'owner',
        onApply: () =>
          setForm((current) => ({ ...current, ownerId: owner.id })),
        title: t('suggestions.singleOwnerTitle'),
      });
    }

    const amount = Number(form.amount || 0);
    if (amount > 0 && !form.minAmount) {
      suggestions.push({
        actionLabel: t('suggestions.apply'),
        description: t('suggestions.minStockDescription'),
        key: 'min-stock',
        onApply: () =>
          setForm((current) => ({
            ...current,
            minAmount: String(Math.max(1, Math.ceil(amount * 0.2))),
          })),
        title: t('suggestions.minStockTitle'),
      });
    }
    if (!form.unitId && options?.units.length === 1 && unit) {
      suggestions.push({
        actionLabel: t('suggestions.apply'),
        description: t('suggestions.singleUnitDescription'),
        key: 'unit',
        onApply: () => setForm((current) => ({ ...current, unitId: unit.id })),
        title: t('suggestions.singleUnitTitle'),
      });
    }
    if (!form.warehouseId && options?.warehouses.length === 1 && warehouse) {
      suggestions.push({
        actionLabel: t('suggestions.apply'),
        description: t('suggestions.singleWarehouseDescription'),
        key: 'warehouse',
        onApply: () =>
          setForm((current) => ({ ...current, warehouseId: warehouse.id })),
        title: t('suggestions.singleWarehouseTitle'),
      });
    }

    return suggestions;
  }, [form, options, setForm, t]);
}
