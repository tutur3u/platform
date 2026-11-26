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

it('ranks Max and Ultra by capabilities rather than comparing unlike amounts', () => {
  expect(
    isPlanUpgrade(
      { tier: 'PRO', amount: 20_000 },
      { tier: 'MAX', amount: 10_000 }
    )
  ).toBe(true);
  expect(
    isPlanUpgrade(
      { tier: 'ULTRA', amount: 20_000 },
      { tier: 'MAX', amount: 100_000 }
    )
  ).toBe(false);
});
