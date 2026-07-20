import { describe, expect, it } from 'vitest';
import { getMiniMonthDays } from './mini-month-utils';

describe('getMiniMonthDays', () => {
  it('builds a six-week Monday-first grid around the selected month', () => {
    const days = getMiniMonthDays(new Date('2026-07-20T00:00:00.000Z'));

    expect(days).toHaveLength(42);
    expect(days[0]?.getDay()).toBe(1);
    expect(days.some((day) => day.getDate() === 1)).toBe(true);
    expect(days.some((day) => day.getMonth() === 7)).toBe(true);
  });
});
