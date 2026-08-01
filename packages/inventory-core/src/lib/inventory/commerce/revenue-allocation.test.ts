import { describe, expect, it } from 'vitest';
import { allocateRecognizedRevenue } from './revenue-allocation';

describe('allocateRecognizedRevenue', () => {
  it('allocates discounts and markups proportionally', () => {
    const lines = [
      { catalogUnitPriceMinor: 1_000, quantity: 1 },
      { catalogUnitPriceMinor: 3_000, quantity: 1 },
    ];
    expect(allocateRecognizedRevenue(3_000, lines)).toEqual([750, 2_250]);
    expect(allocateRecognizedRevenue(5_000, lines)).toEqual([1_250, 3_750]);
  });

  it('uses quantity weights when every catalog value is zero', () => {
    expect(
      allocateRecognizedRevenue(10, [
        { catalogUnitPriceMinor: 0, quantity: 1 },
        { catalogUnitPriceMinor: 0, quantity: 2 },
      ])
    ).toEqual([3, 7]);
  });

  it('breaks equal remainders by stable input order', () => {
    expect(
      allocateRecognizedRevenue(2, [
        { catalogUnitPriceMinor: 1, quantity: 1 },
        { catalogUnitPriceMinor: 1, quantity: 1 },
        { catalogUnitPriceMinor: 1, quantity: 1 },
      ])
    ).toEqual([1, 1, 0]);
  });

  it('preserves exact totals across generated currencies and rounding cases', () => {
    let seed = 0x5eed1234;
    const random = (max: number) => {
      seed = (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0;
      return seed % max;
    };

    for (const decimals of [0, 2, 3]) {
      const scale = 10 ** decimals;
      for (let run = 0; run < 1_000; run += 1) {
        const lineCount = 1 + random(8);
        const lines = Array.from({ length: lineCount }, () => ({
          catalogUnitPriceMinor: random(500 * scale + 1),
          quantity: 1 + random(12),
        }));
        if (run % 17 === 0) {
          for (const line of lines) line.catalogUnitPriceMinor = 0;
        }
        const soldTotal = random(1_000 * scale + 1);
        const allocations = allocateRecognizedRevenue(soldTotal, lines);
        expect(allocations).toHaveLength(lineCount);
        expect(allocations.every(Number.isSafeInteger)).toBe(true);
        expect(allocations.every((amount) => amount >= 0)).toBe(true);
        expect(allocations.reduce((total, amount) => total + amount, 0)).toBe(
          soldTotal
        );
      }
    }
  });
});
