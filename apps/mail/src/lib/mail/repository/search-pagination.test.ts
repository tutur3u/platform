import { describe, expect, it } from 'vitest';
import { loadAllRows } from './search';

describe('mail repository pagination', () => {
  it('loads every database page beyond the legacy 5,000-row boundary', async () => {
    const source = Array.from({ length: 7344 }, (_, index) => ({ id: index }));
    const ranges: Array<[number, number]> = [];

    const rows = await loadAllRows(
      () => ({
        range: async (start: number, end: number) => {
          ranges.push([start, end]);
          return { data: source.slice(start, end + 1), error: null };
        },
      }),
      'Failed to load test rows'
    );

    expect(rows).toHaveLength(7344);
    expect(rows.at(-1)?.id).toBe(7343);
    expect(ranges).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
      [3000, 3999],
      [4000, 4999],
      [5000, 5999],
      [6000, 6999],
      [7000, 7999],
    ]);
  });

  it('surfaces page failures with repository context', async () => {
    await expect(
      loadAllRows(
        () => ({
          range: async () => ({
            data: null,
            error: { message: 'database unavailable' },
          }),
        }),
        'Failed to list mail messages'
      )
    ).rejects.toThrow('Failed to list mail messages: database unavailable');
  });
});
