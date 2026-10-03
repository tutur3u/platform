import { describe, expect, it } from 'vitest';
import {
  InventorySeasonMergedError,
  isInventorySeasonMergedError,
} from './season-merge-errors';

describe('season alias assignment conflicts', () => {
  it('recognizes a preflight alias error', () => {
    expect(isInventorySeasonMergedError(new InventorySeasonMergedError())).toBe(
      true
    );
  });
  it('recognizes the database recheck after an independent concurrent merge', () => {
    expect(
      isInventorySeasonMergedError({
        code: '23514',
        message: 'Sales period was merged; refresh and select its destination',
      })
    ).toBe(true);
  });
  it('does not misclassify eligibility, snapshot or unknown errors', () => {
    for (const error of [
      null,
      new Error('unknown'),
      { code: '23514', message: 'Captured season quotes are immutable' },
      { code: '23514', message: 'Invalid period product workspace' },
      { code: '23503', message: 'Sales period was merged;' },
    ])
      expect(isInventorySeasonMergedError(error)).toBe(false);
  });
});
