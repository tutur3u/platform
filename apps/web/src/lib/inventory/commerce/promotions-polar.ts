import { toPolarCurrency } from '@tuturuuu/internal-api/inventory';

/**
 * Maps a Tuturuuu inventory promotion to the Polar discount create payload.
 *
 * Unit notes (money-critical):
 * - Percentage discounts use basis points: 10% → 1000.
 * - Fixed discounts use the currency's smallest unit (cents): a $5 promotion
 *   (stored in major units) → 500.
 * - `max_uses` (null = unlimited) maps to Polar `maxRedemptions`.
 *
 * Pure so the conversion is unit-testable; the live API call lives in the Polar
 * client helper.
 */
export type PromotionForPolar = {
  code: string;
  max_uses?: number | null;
  name: string;
  use_ratio: boolean;
  value: number | string;
};

export type PolarDiscountInput =
  | {
      basisPoints: number;
      code: string;
      duration: 'once';
      maxRedemptions: number | null;
      name: string;
      products: string[];
      type: 'percentage';
    }
  | {
      amount: number;
      code: string;
      currency: string;
      duration: 'once';
      maxRedemptions: number | null;
      name: string;
      products: string[];
      type: 'fixed';
    };

export function buildPolarDiscountInput(
  promotion: PromotionForPolar,
  currency: string,
  productId: string
): PolarDiscountInput {
  const maxRedemptions = promotion.max_uses ?? null;
  const value = Number(promotion.value) || 0;

  if (promotion.use_ratio) {
    return {
      basisPoints: Math.round(value * 100),
      code: promotion.code,
      duration: 'once',
      maxRedemptions,
      name: promotion.name,
      products: [productId],
      type: 'percentage',
    };
  }

  return {
    amount: Math.round(value * 100),
    code: promotion.code,
    currency: toPolarCurrency(currency),
    duration: 'once',
    maxRedemptions,
    name: promotion.name,
    products: [productId],
    type: 'fixed',
  };
}
