import { getCurrencyLocale } from '@tuturuuu/utils/format';

export function getInventoryCurrencyLocale(currency: string): string {
  return getCurrencyLocale(currency);
}

export function getInventoryCurrencyFractionDigits(currency: string): number {
  return (
    new Intl.NumberFormat(getInventoryCurrencyLocale(currency), {
      style: 'currency',
      currency,
    }).resolvedOptions().maximumFractionDigits ?? 0
  );
}

export function normalizeInventoryPrice(
  amount: number,
  currency: string
): number {
  const fractionDigits = getInventoryCurrencyFractionDigits(currency);
  const factor = 10 ** fractionDigits;

  return Math.round(amount * factor) / factor;
}

export function getInventoryPriceStep(currency: string): string {
  const fractionDigits = getInventoryCurrencyFractionDigits(currency);

  if (fractionDigits <= 0) {
    return '1';
  }

  return (1 / 10 ** fractionDigits).toFixed(fractionDigits);
}
