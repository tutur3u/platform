import { describe, expect, it } from 'vitest';
import { formatRoundedCompactCredits } from '../mira-credit-format';

describe('formatRoundedCompactCredits', () => {
  it('rounds decimal credit values before display', () => {
    expect(formatRoundedCompactCredits(181.985)).toBe('182');
  });

  it('keeps compact notation for large rounded values', () => {
    expect(formatRoundedCompactCredits(119_800.2)).toBe('119.8K');
  });

  it('rounds values just below the next whole credit down', () => {
    expect(formatRoundedCompactCredits(119.49)).toBe('119');
  });
});
