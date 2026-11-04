import { describe, expect, it } from 'vitest';
import {
  BREAK_INTERVAL,
  BREAK_OPTIONS,
  formatBreakDuration,
  getBreakOptionLabels,
  isValidBreakDuration,
  MAX_BREAK_MINUTES,
  MIN_BREAK_MINUTES,
  parseBreakDuration,
  roundToBreakInterval,
} from '../break-duration';

describe('break-duration constants', () => {
  it('exposes every multiple of the interval between the min and max', () => {
    expect(BREAK_INTERVAL).toBe(15);
    expect(MIN_BREAK_MINUTES).toBe(15);
    expect(MAX_BREAK_MINUTES).toBe(120);
    expect([...BREAK_OPTIONS]).toEqual([15, 30, 45, 60, 75, 90, 105, 120]);
  });
});

describe('isValidBreakDuration', () => {
  it.each([
    [15, true],
    [30, true],
    [60, true],
    [120, true],
    [0, false],
    [-15, false],
    [7, false],
    [16, false],
    [14.9, false],
    [135, false],
    [150, false],
    [Number.NaN, false],
    [Number.POSITIVE_INFINITY, false],
  ])('isValidBreakDuration(%s) is %s', (minutes, expected) => {
    expect(isValidBreakDuration(minutes)).toBe(expected);
  });
});

describe('roundToBreakInterval', () => {
  it.each([
    [0, 15],
    [-100, 15],
    [1, 15],
    [7, 15],
    [7.5, 15],
    [22, 15],
    [23, 30],
    [30, 30],
    [44, 45],
    [100, 105],
    [119, 120],
    [121, 120],
    [500, 120],
  ])('roundToBreakInterval(%s) is %s', (minutes, expected) => {
    expect(roundToBreakInterval(minutes)).toBe(expected);
  });

  it('always returns a valid break duration for finite input', () => {
    for (let minutes = -30; minutes <= 300; minutes += 1) {
      expect(isValidBreakDuration(roundToBreakInterval(minutes))).toBe(true);
    }
  });
});

describe('formatBreakDuration', () => {
  it.each([
    [15, '15 min'],
    [45, '45 min'],
    [59, '59 min'],
    [60, '1h'],
    [75, '1h 15m'],
    [90, '1h 30m'],
    [120, '2h'],
    [135, '2h 15m'],
  ])('formatBreakDuration(%s) is %j', (minutes, expected) => {
    expect(formatBreakDuration(minutes)).toBe(expected);
  });
});

describe('getBreakOptionLabels', () => {
  it('maps each break option to a value and formatted label', () => {
    expect(getBreakOptionLabels()).toEqual([
      { value: 15, label: '15 min' },
      { value: 30, label: '30 min' },
      { value: 45, label: '45 min' },
      { value: 60, label: '1h' },
      { value: 75, label: '1h 15m' },
      { value: 90, label: '1h 30m' },
      { value: 105, label: '1h 45m' },
      { value: 120, label: '2h' },
    ]);
  });
});

describe('parseBreakDuration', () => {
  it.each<[unknown, number | null]>([
    ['15', 15],
    ['60', 60],
    ['120', 120],
    ['30 minutes', 30],
    [45, 45],
    [90, 90],
    ['abc', null],
    ['', null],
    ['10', null],
    ['135', null],
    ['0', null],
    ['-15', null],
    [7, null],
    [200, null],
    [undefined, null],
    [null, null],
    [Number.NaN, null],
    [{}, null],
  ])('parseBreakDuration(%j) is %s', (value, expected) => {
    expect(parseBreakDuration(value)).toBe(expected);
  });
});
