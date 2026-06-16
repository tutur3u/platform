import { describe, expect, it } from 'vitest';
import {
  formatMoneyFromMinor,
  getAmountStep,
  getCurrencyFractionDigits,
  getMinorUnitFactor,
  majorToMinor,
  minorToMajor,
  normalizeAmount,
} from './money';

describe('currency precision', () => {
  it('knows fraction digits per currency', () => {
    expect(getCurrencyFractionDigits('USD')).toBe(2);
    expect(getCurrencyFractionDigits('EUR')).toBe(2);
    expect(getCurrencyFractionDigits('JPY')).toBe(0);
    expect(getCurrencyFractionDigits('VND')).toBe(0);
  });

  it('falls back to 2 digits for unknown currencies', () => {
    expect(getCurrencyFractionDigits('XYZ')).toBe(2);
  });

  it('derives the minor-unit factor', () => {
    expect(getMinorUnitFactor('USD')).toBe(100);
    expect(getMinorUnitFactor('JPY')).toBe(1);
    expect(getMinorUnitFactor('VND')).toBe(1);
  });
});

describe('major <-> minor conversion', () => {
  it('converts dollars to cents', () => {
    expect(majorToMinor(100, 'USD')).toBe(10000);
    expect(majorToMinor(9.99, 'USD')).toBe(999);
  });

  it('treats zero-decimal currencies 1:1', () => {
    expect(majorToMinor(500, 'JPY')).toBe(500);
    expect(majorToMinor(25000, 'VND')).toBe(25000);
  });

  it('round-trips cleanly', () => {
    expect(minorToMajor(10000, 'USD')).toBe(100);
    expect(minorToMajor(999, 'USD')).toBe(9.99);
    expect(minorToMajor(500, 'JPY')).toBe(500);
  });

  it('rounds rather than truncating fractional minor units', () => {
    expect(majorToMinor(1.005, 'USD')).toBe(101);
  });

  it('handles non-finite input defensively', () => {
    expect(majorToMinor(Number.NaN, 'USD')).toBe(0);
    expect(minorToMajor(Number.POSITIVE_INFINITY, 'USD')).toBe(0);
  });
});

describe('normalizeAmount & getAmountStep', () => {
  it('normalizes to currency precision', () => {
    expect(normalizeAmount(9.999, 'USD')).toBe(10);
    expect(normalizeAmount(9.994, 'USD')).toBe(9.99);
    expect(normalizeAmount(500.7, 'JPY')).toBe(501);
  });

  it('returns the right input step', () => {
    expect(getAmountStep('USD')).toBe('0.01');
    expect(getAmountStep('JPY')).toBe('1');
    expect(getAmountStep('VND')).toBe('1');
  });
});

describe('formatMoneyFromMinor', () => {
  it('formats USD cents as dollars', () => {
    // Non-breaking space / symbol placement varies by ICU; assert the digits.
    expect(formatMoneyFromMinor(10000, 'USD', 'en-US')).toContain('100.00');
    expect(formatMoneyFromMinor(999, 'USD', 'en-US')).toContain('9.99');
  });

  it('formats zero-decimal currencies without scaling', () => {
    expect(formatMoneyFromMinor(500, 'JPY', 'ja-JP')).toContain('500');
  });
});
