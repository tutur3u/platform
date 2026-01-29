import { describe, expect, it } from 'vitest';
import { getStockChangeAmount } from '@/lib/inventory/stock-change';

describe('getStockChangeAmount', () => {
  it('returns a positive amount when moving from unlimited to finite', () => {
    expect(getStockChangeAmount(null, 5)).toBe(5);
  });

  it('returns a negative amount when moving from finite to unlimited', () => {
    expect(getStockChangeAmount(5, null)).toBe(-5);
  });

  it('returns the delta when both amounts are defined', () => {
    expect(getStockChangeAmount(3, 7)).toBe(4);
  });

  it('returns null when the stock does not change', () => {
    expect(getStockChangeAmount(4, 4)).toBeNull();
  });

  it('returns null when both are unlimited or zero', () => {
    expect(getStockChangeAmount(null, null)).toBeNull();
    expect(getStockChangeAmount(null, 0)).toBeNull();
    expect(getStockChangeAmount(0, null)).toBeNull();
    expect(getStockChangeAmount(0, 0)).toBeNull();
  });
});
