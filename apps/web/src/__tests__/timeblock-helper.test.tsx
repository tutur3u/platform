import {
  compareTimetz,
  maxTimetz,
  minTimetz,
} from '@tuturuuu/utils/date-helper';
import { describe, expect, test } from 'vitest';

describe('time-with-time-zone helpers', () => {
  test('compares equal, earlier, and later times', () => {
    expect(compareTimetz('08:00:00+00:00', '08:00:00+00:00')).toBe(0);
    expect(compareTimetz('08:00:00+00:00', '09:00:00+00:00')).toBe(-1);
    expect(compareTimetz('10:00:00+00:00', '09:00:00+00:00')).toBe(1);
  });

  test('selects the earliest time', () => {
    expect(minTimetz('08:00:00+00:00', '08:00:00+00:00')).toBe(
      '08:00:00+00:00'
    );
    expect(minTimetz('08:00:00+00:00', '09:00:00+00:00')).toBe(
      '08:00:00+00:00'
    );
    expect(minTimetz('10:00:00+00:00', '09:00:00+00:00')).toBe(
      '09:00:00+00:00'
    );
  });

  test('selects the latest time', () => {
    expect(maxTimetz('08:00:00+00:00', '08:00:00+00:00')).toBe(
      '08:00:00+00:00'
    );
    expect(maxTimetz('08:00:00+00:00', '09:00:00+00:00')).toBe(
      '09:00:00+00:00'
    );
    expect(maxTimetz('10:00:00+00:00', '09:00:00+00:00')).toBe(
      '10:00:00+00:00'
    );
  });
});
