import { describe, expect, it } from 'vitest';
import {
  buildEstimationIndices,
  mapEstimationPoints,
} from './estimation-mapping';

describe('estimation-mapping', () => {
  it('maps t-shirt sizes correctly', () => {
    expect(mapEstimationPoints(0, 't-shirt')).toBe('-');
    expect(mapEstimationPoints(5, 't-shirt')).toBe('XL');
  });

  it('maps fibonacci indices correctly', () => {
    expect(mapEstimationPoints(4, 'fibonacci')).toBe('5');
    expect(mapEstimationPoints(7, 'fibonacci')).toBe('21');
  });

  it('builds indices respecting extended flag', () => {
    expect(
      buildEstimationIndices({ extended: false, allowZero: true })
    ).toEqual([0, 1, 2, 3, 4, 5]);
    expect(buildEstimationIndices({ extended: true, allowZero: true })).toEqual(
      [0, 1, 2, 3, 4, 5, 6, 7]
    );
  });

  it('omits zero when allowZero is false', () => {
    expect(
      buildEstimationIndices({ extended: false, allowZero: false })
    ).toEqual([1, 2, 3, 4, 5]);
  });
});
