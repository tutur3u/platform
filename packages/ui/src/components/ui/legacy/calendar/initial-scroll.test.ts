import { describe, expect, it } from 'vitest';
import {
  DEFAULT_WORK_START_HOUR,
  earliestWorkStartHour,
  initialCalendarScrollTop,
} from './initial-scroll';
import type { WeekTimeRanges } from './settings/time-range-picker';

const weekday = {
  enabled: true,
  timeBlocks: [{ startTime: '09:00', endTime: '17:00' }],
};
const weekend = { ...weekday, enabled: false };
const defaultWeekTimeRanges: WeekTimeRanges = {
  monday: weekday,
  tuesday: weekday,
  wednesday: weekday,
  thursday: weekday,
  friday: weekday,
  saturday: weekend,
  sunday: weekend,
};

const base = { hourHeight: 80, viewportHeight: 640, workStartHour: 9 };

describe('initial calendar scroll', () => {
  it('opens at the working day when today is not visible', () => {
    expect(initialCalendarScrollTop({ ...base, nowHour: null })).toBe(680);
  });

  it('keeps the working day when now is already comfortably visible', () => {
    expect(initialCalendarScrollTop({ ...base, nowHour: 11 })).toBe(680);
  });

  it('moves to now when it would fall below the fold', () => {
    expect(initialCalendarScrollTop({ ...base, nowHour: 15 })).toBeCloseTo(
      15 * 80 - 640 / 3
    );
  });

  it('moves to now before the working day starts', () => {
    expect(initialCalendarScrollTop({ ...base, nowHour: 6 })).toBeCloseTo(
      6 * 80 - 640 / 3
    );
  });

  it('never scrolls past the end of the day', () => {
    expect(initialCalendarScrollTop({ ...base, nowHour: 23.9 })).toBe(
      24 * 80 - 640
    );
  });

  it('reads the earliest enabled working-hours block', () => {
    expect(earliestWorkStartHour(defaultWeekTimeRanges)).toBe(9);
    expect(
      earliestWorkStartHour({
        ...defaultWeekTimeRanges,
        saturday: {
          enabled: true,
          timeBlocks: [{ startTime: '07:30', endTime: '10:00' }],
        },
      })
    ).toBe(7.5);
    expect(earliestWorkStartHour(null)).toBe(DEFAULT_WORK_START_HOUR);
  });
});
