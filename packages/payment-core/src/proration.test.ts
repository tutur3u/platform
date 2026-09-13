import { describe, expect, it } from 'vitest';
import { isPlanUpgrade } from './proration';

describe('plan change direction', () => {
  it('keeps lower-tier changes a downgrade even when the annual charge is larger', () => {
    expect(
      isPlanUpgrade(
        { tier: 'PRO', amount: 1500 },
        { tier: 'PLUS', amount: 8000 }
      )
    ).toBe(false);
  });
  it('uses full cycle charges consistently for the same tier', () => {
    expect(
      isPlanUpgrade(
        { tier: 'PLUS', amount: 800 },
        { tier: 'PLUS', amount: 8000 }
      )
    ).toBe(true);
    expect(
      isPlanUpgrade(
        { tier: 'PLUS', amount: 8000 },
        { tier: 'PLUS', amount: 800 }
      )
    ).toBe(false);
  });
});
