import type { InventoryPromotionPayload } from '@tuturuuu/internal-api/inventory';
import type { ProductPromotion } from '@tuturuuu/types/primitives/ProductPromotion';

export type PromotionUnit = 'currency' | 'percentage';

export type PromotionFormState = {
  code: string;
  description: string;
  maxUses: string;
  name: string;
  unit: PromotionUnit;
  value: string;
};

export function emptyPromotionForm(): PromotionFormState {
  return {
    code: '',
    description: '',
    maxUses: '',
    name: '',
    unit: 'percentage',
    value: '',
  };
}

export function promotionFormFromRow(
  row: ProductPromotion
): PromotionFormState {
  return {
    code: row.code ?? '',
    description: row.description ?? '',
    maxUses:
      row.max_uses === null || row.max_uses === undefined
        ? ''
        : String(row.max_uses),
    name: row.name ?? '',
    unit: row.use_ratio ? 'percentage' : 'currency',
    value: String(row.value ?? ''),
  };
}

/**
 * A promotion is valid when it has a name, a code, and a value that — for
 * percentage discounts — stays within 0–100 (mirrors the API's zod guard).
 */
export function isPromotionFormValid(form: PromotionFormState): boolean {
  if (!form.name.trim() || !form.code.trim()) return false;

  const value = Number(form.value);
  if (!Number.isFinite(value) || value < 0) return false;
  if (form.unit === 'percentage' && value > 100) return false;

  return true;
}

export function buildPromotionPayload(
  form: PromotionFormState
): InventoryPromotionPayload {
  const trimmedMaxUses = form.maxUses.trim();

  return {
    code: form.code.trim(),
    description: form.description.trim() || undefined,
    max_uses: trimmedMaxUses ? Math.max(0, Number(trimmedMaxUses)) : null,
    name: form.name.trim(),
    unit: form.unit,
    value: Math.max(0, Number(form.value) || 0),
  };
}
