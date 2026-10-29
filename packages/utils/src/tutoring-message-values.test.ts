import { describe, expect, it } from 'vitest';
import {
  formatTutoringDate,
  formatTutoringTimeRange,
  getTutoringWeekdayLabel,
  selectTutoringClassTime,
  TUTORING_VALUE_UNKNOWN,
  type TutoringClassTimeSession,
} from './tutoring-message-values';

const classAt = (
  startsAt: string,
  endsAt: string,
  overrides: Partial<TutoringClassTimeSession> = {}
): TutoringClassTimeSession => ({
  endsAt,
  startTimezone: 'Asia/Ho_Chi_Minh',
  startsAt,
  status: 'scheduled',
  ...overrides,
});

describe('tutoring time range', () => {
  it('adds the duration to the start time', () => {
    expect(formatTutoringTimeRange('15:15', 45)).toBe('15:15-16:00');
    expect(formatTutoringTimeRange('15:15:00', 45)).toBe('15:15-16:00');
    expect(formatTutoringTimeRange('09:30', 60)).toBe('09:30-10:30');
  });

  it('wraps past midnight and keeps an unreadable start as given', () => {
    expect(formatTutoringTimeRange('23:30', 45)).toBe('23:30-00:15');
    expect(formatTutoringTimeRange('soon', 45)).toBe('soon');
  });
});

describe('tutoring weekday', () => {
  it('names Monday to Saturday as thứ 2 to thứ 7', () => {
    expect(getTutoringWeekdayLabel('2026-10-26')).toBe('thứ 2');
    expect(getTutoringWeekdayLabel('2026-10-27')).toBe('thứ 3');
    expect(getTutoringWeekdayLabel('2026-10-28')).toBe('thứ 4');
    expect(getTutoringWeekdayLabel('2026-10-29')).toBe('thứ 5');
    expect(getTutoringWeekdayLabel('2026-10-30')).toBe('thứ 6');
    expect(getTutoringWeekdayLabel('2026-10-31')).toBe('thứ 7');
  });

  it('names Sunday Chủ nhật, across a month and year boundary', () => {
    expect(getTutoringWeekdayLabel('2026-11-01')).toBe('Chủ nhật');
    expect(getTutoringWeekdayLabel('2027-01-03')).toBe('Chủ nhật');
    expect(getTutoringWeekdayLabel('2027-01-04')).toBe('thứ 2');
  });

  it('returns the unknown value for a malformed date', () => {
    expect(getTutoringWeekdayLabel('31/10/2026')).toBe(TUTORING_VALUE_UNKNOWN);
    expect(getTutoringWeekdayLabel('')).toBe(TUTORING_VALUE_UNKNOWN);
    expect(getTutoringWeekdayLabel('2026-02-31')).toBe(TUTORING_VALUE_UNKNOWN);
    expect(formatTutoringDate('2026-10-31')).toBe('31/10/2026');
  });
});

describe('official class time', () => {
  // 16:00-17:30 in Ho Chi Minh (UTC+7).
  const saturday = classAt('2026-10-31T09:00:00Z', '2026-10-31T10:30:00Z');
  const nextTuesday = classAt('2026-11-03T11:00:00Z', '2026-11-03T12:30:00Z');

  it('uses the class on the tutoring date', () => {
    expect(
      selectTutoringClassTime([nextTuesday, saturday], '2026-10-31', '15:15')
    ).toBe('16:00-17:30');
  });

  it('reads the class date and time in the session time zone', () => {
    // 02:00 UTC on the 31st is 09:00 on the 31st in Ho Chi Minh, and 19:00 on
    // the 30th in Los Angeles.
    const early = classAt('2026-10-31T02:00:00Z', '2026-10-31T03:30:00Z');
    expect(selectTutoringClassTime([early], '2026-10-31', '08:00')).toBe(
      '09:00-10:30'
    );
    const la = classAt('2026-10-31T02:00:00Z', '2026-10-31T03:30:00Z', {
      startTimezone: 'America/Los_Angeles',
    });
    expect(selectTutoringClassTime([la], '2026-10-30', '08:00')).toBe(
      '19:00-20:30'
    );
  });

  it('falls to the next class, with its date, when none falls on the day', () => {
    expect(
      selectTutoringClassTime([nextTuesday, saturday], '2026-11-01', '15:15')
    ).toBe('18:00-19:30 ngày 03/11/2026');
  });

  it('skips earlier and cancelled classes', () => {
    const cancelled = classAt('2026-11-02T09:00:00Z', '2026-11-02T10:30:00Z', {
      status: 'cancelled',
    });
    expect(
      selectTutoringClassTime(
        [saturday, cancelled, nextTuesday],
        '2026-11-01',
        '15:15'
      )
    ).toBe('18:00-19:30 ngày 03/11/2026');
  });

  it('is undetermined when no class follows', () => {
    expect(selectTutoringClassTime([saturday], '2026-11-01', '15:15')).toBe(
      'Chưa xác định'
    );
    expect(selectTutoringClassTime([], '2026-10-31', '15:15')).toBe(
      'Chưa xác định'
    );
  });
});
