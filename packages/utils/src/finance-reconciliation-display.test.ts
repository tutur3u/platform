import { describe, expect, it } from 'vitest';
import { getCurrencyLocale } from './currencies';
import {
  formatInventoryAllocationAmount,
  formatInventoryReconciliationAmount,
} from './finance-reconciliation-display';
import { minorToMajor } from './money';

describe('Inventory reconciliation display boundaries', () => {
  it.each(['HUF', 'IDR', 'COP', 'PKR', 'IQD', 'IRR', 'LAK', 'MGA', 'CLF'])(
    'preserves Inventory allocation units for %s',
    (currency) => {
      const expected = new Intl.NumberFormat(getCurrencyLocale(currency), {
        currency,
        maximumFractionDigits: 2,
        style: 'currency',
      }).format(minorToMajor(12_300, currency));
      expect(formatInventoryAllocationAmount(12_300, currency)).toBe(expected);
    }
  );

  it('keeps reconciliation totals on their separate SQL storage scale', () => {
    for (const [currency, major] of [
      ['USD', 123],
      ['MGA', 12_300],
      ['CLF', 123],
    ] as const) {
      const expected = new Intl.NumberFormat(getCurrencyLocale(currency), {
        currency,
        maximumFractionDigits: 2,
        style: 'currency',
      }).format(major);
      expect(formatInventoryReconciliationAmount(12_300, currency)).toBe(
        expected
      );
    }
  });

  it.each([
    formatInventoryReconciliationAmount,
    formatInventoryAllocationAmount,
  ])(
    'renders a neutral placeholder for malformed amounts and currencies',
    (format) => {
      for (const amount of [
        NaN,
        Infinity,
        -Infinity,
        null,
        undefined,
        'invalid',
        1.5,
        2 ** 53,
      ]) {
        expect(format(amount, 'USD')).toBe('—');
      }
      for (const currency of ['US', 'USDD', 'U$D', '123', '']) {
        expect(format(123, currency)).toBe('—');
      }
    }
  );
});
