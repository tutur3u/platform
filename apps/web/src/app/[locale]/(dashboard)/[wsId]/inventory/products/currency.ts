/**
 * Thin re-export shim. The currency-precision helpers now live in the shared
 * money module (`@tuturuuu/utils/money`) so every app uses one source of truth.
 * Kept here for backward compatibility with existing inventory imports.
 */

import { getCurrencyLocale } from '@tuturuuu/utils/format';
import {
  getAmountStep,
  getCurrencyFractionDigits,
  normalizeAmount,
} from '@tuturuuu/utils/money';

export function getInventoryCurrencyLocale(currency: string): string {
  return getCurrencyLocale(currency);
}

export function getInventoryCurrencyFractionDigits(currency: string): number {
  return getCurrencyFractionDigits(currency);
}

export function normalizeInventoryPrice(
  amount: number,
  currency: string
): number {
  return normalizeAmount(amount, currency);
}

export function getInventoryPriceStep(currency: string): string {
  return getAmountStep(currency);
}
