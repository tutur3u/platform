import { formatMoneyFromMinor } from '@tuturuuu/utils/money';

/**
 * Format a major-unit amount (whole dollars/units) as currency. Used for values
 * that are NOT stored in minor units — e.g. raw product prices and promotion
 * values. For commerce money stored in minor units, use {@link money} instead.
 */
export function currency(
  value: number | null | undefined,
  code = 'USD',
  maximumFractionDigits = 0
) {
  return new Intl.NumberFormat(undefined, {
    currency: code,
    maximumFractionDigits,
    style: 'currency',
  }).format(Number(value ?? 0));
}

/**
 * Format an amount stored in integer minor units (cents for USD, whole units
 * for JPY/VND) as currency. This is the canonical display path for inventory
 * commerce money — listing/bundle prices, checkout totals, sales revenue,
 * costing, and P&L figures are all stored in minor units.
 */
export function money(minorValue: number | null | undefined, code = 'USD') {
  return formatMoneyFromMinor(Number(minorValue ?? 0), code);
}
