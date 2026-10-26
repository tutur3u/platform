import { ZodError } from 'zod';
import { getCurrencyLocale } from './currencies';
import {
  formatMoney,
  minorUnitsSchema,
  moneyCurrencySchema,
  parseMoneyFromMinor,
} from './finance-money';
import { formatCurrency } from './format';
import { minorToMajor } from './money';

export function formatInventoryReconciliationAmount(
  amount: unknown,
  currency: string
): string {
  try {
    const money = parseMoneyFromMinor(amount, currency);
    return formatMoney(money, getCurrencyLocale(money.currency), {
      maximumFractionDigits: money.currency === 'VND' ? 0 : 2,
    });
  } catch (error) {
    if (error instanceof ZodError || error instanceof RangeError) return '—';
    throw error;
  }
}

export function formatInventoryAllocationAmount(
  amount: unknown,
  currency: string
): string {
  try {
    const minor = minorUnitsSchema.parse(amount);
    const code = moneyCurrencySchema.parse(currency);
    // Inventory allocation storage follows Intl, independently of Finance SQL.
    return formatCurrency(
      minorToMajor(minor, code),
      code,
      getCurrencyLocale(code),
      {
        maximumFractionDigits: code === 'VND' ? 0 : 2,
      }
    );
  } catch (error) {
    if (error instanceof ZodError || error instanceof RangeError) return '—';
    throw error;
  }
}
