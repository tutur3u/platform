import { z } from 'zod';
import { formatCurrency } from './format';
import { roundScaled } from './money';

// Match private.inventory_finance_minor_to_major, including its legacy MGA
// and default two-decimal mappings. Intl precision can differ from stored units.
const zeroDecimalCurrencies = new Set([
  'BIF',
  'CLP',
  'DJF',
  'GNF',
  'ISK',
  'JPY',
  'KMF',
  'KRW',
  'MGA',
  'PYG',
  'RWF',
  'UGX',
  'VND',
  'VUV',
  'XAF',
  'XOF',
  'XPF',
]);
const threeDecimalCurrencies = new Set([
  'BHD',
  'IQD',
  'JOD',
  'KWD',
  'LYD',
  'OMR',
  'TND',
]);

/** Inventory Finance's persisted unit scale, independent of display precision. */
export function getFinanceMinorUnitFactor(currency: string): number {
  const code = currency.trim().toUpperCase();
  if (zeroDecimalCurrencies.has(code)) return 1;
  if (threeDecimalCurrencies.has(code)) return 1000;
  return 100;
}

export const minorUnitsSchema = z
  .number()
  .int()
  .transform((value) => (value === 0 ? 0 : value))
  .brand<'MinorUnits'>();

export type MinorUnits = z.infer<typeof minorUnitsSchema>;

const moneySchema = z
  .object({
    minorUnits: minorUnitsSchema,
    currency: z
      .string()
      .trim()
      .regex(/^[a-z]{3}$/i)
      .toUpperCase(),
  })
  .readonly()
  .brand<'Money'>();

/** Validated, currency-bearing money. Raw API/storage numbers stop here. */
export type Money = z.infer<typeof moneySchema>;

export function parseMoneyFromMinor(amount: unknown, currency: string): Money {
  return moneySchema.parse({ minorUnits: amount, currency });
}

/** Explicit major-unit boundary using the existing scaled rounding rule. */
export function parseMoneyFromMajor(amount: unknown, currency: string): Money {
  const major = z.number().parse(amount);
  return parseMoneyFromMinor(
    roundScaled(major * getFinanceMinorUnitFactor(currency)),
    currency
  );
}

export function moneyToMajor(money: Money): number {
  return money.minorUnits / getFinanceMinorUnitFactor(money.currency);
}

export function addMoney(left: Money, right: Money): Money {
  if (left.currency !== right.currency) {
    throw new Error('Cannot add money in different currencies');
  }
  // Check the exact sum before converting it back to a JavaScript number.
  const total = BigInt(left.minorUnits) + BigInt(right.minorUnits);
  if (
    total > BigInt(Number.MAX_SAFE_INTEGER) ||
    total < BigInt(Number.MIN_SAFE_INTEGER)
  ) {
    throw new RangeError('Money total exceeds safe integer range');
  }
  return parseMoneyFromMinor(Number(total), left.currency);
}

export function formatMoney(
  money: Money,
  locale?: string,
  options?: Partial<Intl.NumberFormatOptions>
): string {
  return formatCurrency(moneyToMajor(money), money.currency, locale, options);
}
