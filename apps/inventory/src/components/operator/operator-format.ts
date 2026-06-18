import { formatMoneyFromMinor } from '@tuturuuu/utils/money';

/**
 * Format a major-unit amount (whole dollars/units) as currency. Used for values
 * that are NOT stored in minor units — e.g. raw product prices and promotion
 * values. For commerce money stored in minor units, use {@link money} instead.
 *
 * By default the fraction digits follow the currency's own standard (USD →
 * `$10.00`, JPY/VND → `¥1000`), so prices always render with a sign and the
 * right number of decimals. Pass `maximumFractionDigits` only to override.
 */
export function currency(
  value: number | null | undefined,
  code = 'USD',
  maximumFractionDigits?: number
) {
  return new Intl.NumberFormat(undefined, {
    currency: code,
    style: 'currency',
    ...(maximumFractionDigits === undefined ? {} : { maximumFractionDigits }),
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
