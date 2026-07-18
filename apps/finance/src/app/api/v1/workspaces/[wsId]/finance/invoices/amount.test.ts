import { describe, expect, it } from 'vitest';
import { normalizeInvoiceStoredAmount } from './amount';

describe('normalizeInvoiceStoredAmount', () => {
  it('preserves cent-level prices', () => {
    expect(normalizeInvoiceStoredAmount(8.1)).toBe(8.1);
    expect(normalizeInvoiceStoredAmount(10.81)).toBe(10.81);
  });

  it('preserves supported sub-cent precision and removes floating noise', () => {
    expect(normalizeInvoiceStoredAmount(1.2345674)).toBe(1.234567);
    expect(normalizeInvoiceStoredAmount(0.1 + 0.2)).toBe(0.3);
  });
});
