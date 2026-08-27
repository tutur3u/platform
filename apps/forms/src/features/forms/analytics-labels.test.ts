import { describe, expect, it } from 'vitest';
import { decodeAnalyticsLabel } from './analytics-labels';

describe('decodeAnalyticsLabel', () => {
  it('decodes percent-encoded place names', () => {
    expect(decodeAnalyticsLabel('Hong%20Kong')).toBe('Hong Kong');
    expect(decodeAnalyticsLabel('S%C3%A3o%20Paulo')).toBe('São Paulo');
  });

  it('leaves plain labels untouched', () => {
    expect(decodeAnalyticsLabel('Singapore')).toBe('Singapore');
    expect(decodeAnalyticsLabel('US')).toBe('US');
  });

  it('returns malformed input rather than throwing', () => {
    // A label that cannot be decoded is still a real bucket with real
    // responses behind it; dropping the row would be worse than an ugly one.
    expect(decodeAnalyticsLabel('100%')).toBe('100%');
    expect(decodeAnalyticsLabel('%E0%A4%A')).toBe('%E0%A4%A');
  });
});
