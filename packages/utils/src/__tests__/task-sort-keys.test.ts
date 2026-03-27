import { beforeEach, describe, expect, it } from 'vitest';
import {
  calculateBottomSortKey,
  calculateTopSortKey,
  getSortKeyConfig,
  resetSortKeySequence,
} from '../task-helper';

describe('task sort key helpers', () => {
  beforeEach(() => {
    resetSortKeySequence();
  });

  it('places a new task before the current first task', () => {
    const nextSortKey = 5_000_000;
    const sortKey = calculateTopSortKey(nextSortKey);

    expect(sortKey).toBeGreaterThan(0);
    expect(sortKey).toBeLessThan(nextSortKey);
  });

  it('uses the default sort key when inserting into an empty list', () => {
    const { DEFAULT } = getSortKeyConfig();

    expect(calculateTopSortKey(null)).toBe(DEFAULT + 1);
  });

  it('places a new task after the current last task', () => {
    const previousSortKey = 5_000_000;
    const { BASE_UNIT } = getSortKeyConfig();

    expect(calculateBottomSortKey(previousSortKey)).toBe(
      previousSortKey + BASE_UNIT + 1
    );
  });
});
