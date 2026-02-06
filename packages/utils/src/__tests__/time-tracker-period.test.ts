import { describe, expect, it } from 'vitest';
import {
  formatTimeTrackerDateRange,
  getTimeTrackerPeriodBounds,
} from '../time-tracker-period';

describe('time-tracker-period', () => {
  it('builds ISO week boundaries in UTC', () => {
    const date = new Date('2024-02-07T10:30:00.000Z');
    const { startOfPeriod, endOfPeriod } = getTimeTrackerPeriodBounds(
      date,
      'week',
      'UTC'
    );

    expect(startOfPeriod.toISOString()).toBe('2024-02-05T00:00:00.000Z');
    expect(endOfPeriod.toISOString()).toBe('2024-02-11T23:59:59.999Z');
  });

  it('formats a week range with a consistent locale', () => {
    const start = new Date('2024-02-05T00:00:00.000Z');
    const end = new Date('2024-02-11T23:59:59.999Z');
    const expected = `${start.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    })} - ${end.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })}`;

    expect(
      formatTimeTrackerDateRange(start, end, 'week', {
        locale: 'en-US',
        referenceDate: new Date('2023-01-01T00:00:00.000Z'),
      })
    ).toBe(expected);
  });

  it('formats a day range without a year in the same year', () => {
    const start = new Date('2024-03-12T09:00:00.000Z');
    const expected = start.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });

    expect(
      formatTimeTrackerDateRange(start, start, 'day', {
        locale: 'en-US',
        referenceDate: new Date('2024-01-01T00:00:00.000Z'),
      })
    ).toBe(expected);
  });
});
