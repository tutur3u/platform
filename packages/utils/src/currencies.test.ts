import { describe, expect, it } from 'vitest';
import {
  getCurrencyConfig,
  getCurrencyLocale,
  isSupportedCurrency,
  resolveSupportedCurrency,
} from './currencies';

describe('resolveSupportedCurrency', () => {
  it('normalizes supported currency codes', () => {
    expect(resolveSupportedCurrency(' sgd ')).toBe('SGD');
    expect(resolveSupportedCurrency('eur')).toBe('EUR');
  });

  it('uses a supported fallback for missing or unsupported values', () => {
    expect(resolveSupportedCurrency(undefined, 'VND')).toBe('VND');
    expect(resolveSupportedCurrency(null, 'EUR')).toBe('EUR');
    expect(resolveSupportedCurrency('XYZ', 'SGD')).toBe('SGD');
  });

  it('falls back to USD when the fallback is unsupported', () => {
    expect(resolveSupportedCurrency('', 'XYZ')).toBe('USD');
    expect(resolveSupportedCurrency('ZZZ', 'XYZ')).toBe('USD');
  });
});

describe('currency lookup normalization', () => {
  it('trims currency codes before support and locale checks', () => {
    expect(isSupportedCurrency(' vnd ')).toBe(true);
    expect(getCurrencyLocale(' php ')).toBe('en-PH');
    expect(getCurrencyConfig(' eur ')?.code).toBe('EUR');
  });
});
