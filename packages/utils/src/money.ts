/**
 * Centralized money/minor-unit helpers.
 *
 * Money is modeled as integer **minor units** (the currency's smallest unit:
 * cents for USD/EUR, but whole units for zero-decimal currencies like JPY/VND,
 * and thousandths for three-decimal currencies like BHD). This matches how
 * payment processors (e.g. Polar/Stripe) represent amounts and avoids floating
 * point drift on money.
 *
 * Use {@link majorToMinor} when persisting a user-entered amount, and
 * {@link minorToMajor} / {@link formatMoneyFromMinor} when reading a stored
 * amount back for display. The conversion factor is currency-aware, so never
 * hard-code `* 100` / `/ 100`.
 */

import { getCurrencyLocale } from './currencies';
import { formatCurrency } from './format';

const DEFAULT_FRACTION_DIGITS = 2;

// Intl construction is comparatively expensive; cache per currency code.
const fractionDigitsCache = new Map<string, number>();

/**
 * Round a scaled value to the nearest integer while neutralizing binary
 * floating-point error (e.g. `1.005 * 100` is `100.4999…`, which must round to
 * `101`, not `100`). Trimming to 4 extra decimals before rounding removes the
 * noise without affecting legitimate values.
 */
function roundScaled(value: number): number {
  return Math.round(Number(value.toFixed(4)));
}

/**
 * Number of decimal places a currency uses (USD → 2, JPY/VND → 0, BHD → 3).
 * Falls back to 2 for unknown/invalid currency codes.
 */
export function getCurrencyFractionDigits(currency = 'USD'): number {
  const code = currency.toUpperCase();
  const cached = fractionDigitsCache.get(code);
  if (cached !== undefined) return cached;

  let digits = DEFAULT_FRACTION_DIGITS;
  try {
    digits =
      new Intl.NumberFormat(getCurrencyLocale(code), {
        style: 'currency',
        currency: code,
      }).resolvedOptions().maximumFractionDigits ?? DEFAULT_FRACTION_DIGITS;
  } catch {
    digits = DEFAULT_FRACTION_DIGITS;
  }

  fractionDigitsCache.set(code, digits);
  return digits;
}

/**
 * Multiplier between a currency's major and minor units
 * (USD → 100, JPY/VND → 1, BHD → 1000).
 */
export function getMinorUnitFactor(currency = 'USD'): number {
  return 10 ** getCurrencyFractionDigits(currency);
}

/**
 * Convert a major-unit amount (e.g. dollars `100`, or `9.99`) into integer
 * minor units (e.g. `10000`, `999`) for storage / sending to a payment API.
 */
export function majorToMinor(major: number, currency = 'USD'): number {
  if (!Number.isFinite(major)) return 0;
  return roundScaled(major * getMinorUnitFactor(currency));
}

/**
 * Convert integer minor units (e.g. `10000`) back into a major-unit amount
 * (e.g. `100`) for display or for ledgers that store major units.
 */
export function minorToMajor(minor: number, currency = 'USD'): number {
  if (!Number.isFinite(minor)) return 0;
  return minor / getMinorUnitFactor(currency);
}

/**
 * Round a major-unit amount to the currency's precision (drops sub-minor-unit
 * noise from user input before it is converted/stored).
 */
export function normalizeAmount(major: number, currency = 'USD'): number {
  if (!Number.isFinite(major)) return 0;
  const factor = getMinorUnitFactor(currency);
  return roundScaled(major * factor) / factor;
}

/**
 * The numeric step a major-unit price input should use for the currency
 * ('1' for zero-decimal currencies, '0.01' for two-decimal, etc.).
 */
export function getAmountStep(currency = 'USD'): string {
  const fractionDigits = getCurrencyFractionDigits(currency);
  if (fractionDigits <= 0) return '1';
  return (1 / 10 ** fractionDigits).toFixed(fractionDigits);
}

/**
 * Format an amount stored in minor units as a localized currency string.
 * This is the canonical display path for minor-unit-stored money.
 */
export function formatMoneyFromMinor(
  minorAmount: number,
  currency = 'USD',
  locale?: string,
  options?: Partial<Intl.NumberFormatOptions>
): string {
  return formatCurrency(
    minorToMajor(minorAmount, currency),
    currency,
    locale,
    options
  );
}
