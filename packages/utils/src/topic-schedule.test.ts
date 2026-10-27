import { describe, expect, it } from 'vitest';
import {
  addMinutesToScheduleTime,
  daysInScheduleMonth,
  isGvnnContactTags,
  mapToSameNthWeekday,
  normalizeScheduleTime,
  pickPrimaryGroupTeacher,
  scheduleDurationMinutes,
  scheduleMonthRange,
  scheduleSlotKey,
  scheduleWeekday,
  scheduleWeekdayOccurrence,
  shiftScheduleMonth,
} from './topic-schedule';

describe('schedule months', () => {
  it('knows month lengths, including leap February', () => {
    expect(daysInScheduleMonth('2026-02')).toBe(28);
    expect(daysInScheduleMonth('2028-02')).toBe(29);
    expect(daysInScheduleMonth('2026-11')).toBe(30);
    expect(daysInScheduleMonth('2026-12')).toBe(31);
    expect(scheduleMonthRange('2026-11')).toEqual({
      end: '2026-11-30',
      start: '2026-11-01',
    });
  });

  it('shifts across year boundaries', () => {
    expect(shiftScheduleMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftScheduleMonth('2026-01', -1)).toBe('2025-12');
  });

  it('rejects invalid months and dates', () => {
    expect(() => scheduleMonthRange('2026-13')).toThrow();
    expect(() => scheduleWeekday('2026-02-30')).toThrow();
  });
});

describe('mapToSameNthWeekday', () => {
  it('keeps the nth weekday between months of different lengths', () => {
    // 2026-10-13 is the 2nd Tuesday of October.
    expect(scheduleWeekday('2026-10-13')).toBe(2);
    expect(scheduleWeekdayOccurrence('2026-10-13')).toBe(2);
    expect(mapToSameNthWeekday('2026-10-13', '2026-11')).toBe('2026-11-10');
    // 1st Sunday of November -> 1st Sunday of February (28 days).
    expect(mapToSameNthWeekday('2026-11-01', '2027-02')).toBe('2027-02-07');
    // 4th Saturday of a 31-day month -> 4th Saturday of February.
    expect(mapToSameNthWeekday('2026-10-24', '2027-02')).toBe('2027-02-27');
  });

  it('returns null for a 5th weekday the target month lacks', () => {
    // 2026-10-29 is the 5th Thursday of October; November has four.
    expect(scheduleWeekdayOccurrence('2026-10-29')).toBe(5);
    expect(mapToSameNthWeekday('2026-10-29', '2026-11')).toBeNull();
    // ...but December 2026 has a 5th Thursday (Dec 31).
    expect(mapToSameNthWeekday('2026-10-29', '2026-12')).toBe('2026-12-31');
  });

  it('applies no holiday calendar: every mapped date is kept', () => {
    // 1st Friday of January 2027 is Jan 1 (New Year) and is still returned.
    expect(mapToSameNthWeekday('2026-12-04', '2027-01')).toBe('2027-01-01');
  });
});

describe('schedule times', () => {
  it('normalizes times', () => {
    expect(normalizeScheduleTime('9:05')).toBe('09:05');
    expect(normalizeScheduleTime('18:30:00')).toBe('18:30');
    expect(normalizeScheduleTime('24:00')).toBeNull();
    expect(normalizeScheduleTime('')).toBeNull();
  });

  it('adds the default 30 minutes and refuses to pass midnight', () => {
    expect(addMinutesToScheduleTime('17:45', 30)).toBe('18:15');
    expect(addMinutesToScheduleTime('23:30', 29)).toBe('23:59');
    expect(addMinutesToScheduleTime('23:45', 30)).toBeNull();
  });

  it('derives the stored duration', () => {
    expect(scheduleDurationMinutes('17:30', '18:00')).toBe(30);
    expect(scheduleDurationMinutes('17:30:00', '18:15:00')).toBe(45);
    expect(scheduleDurationMinutes('18:00', '17:30')).toBeNull();
    expect(scheduleDurationMinutes('18:00', null)).toBeNull();
  });

  it('keys a slot by class, date and normalized start', () => {
    expect(
      scheduleSlotKey({
        groupId: 'g',
        sessionDate: '2026-11-10',
        startTime: '17:30:00',
      })
    ).toBe(
      scheduleSlotKey({
        groupId: 'g',
        sessionDate: '2026-11-10',
        startTime: '17:30',
      })
    );
  });
});

describe('GVNN contacts and GVCN choice', () => {
  it('matches the GVNN tag case-insensitively', () => {
    expect(isGvnnContactTags(['gvnn'])).toBe(true);
    expect(isGvnnContactTags([' GVNN '])).toBe(true);
    expect(isGvnnContactTags(['foreign_teacher_schedule'])).toBe(false);
    expect(isGvnnContactTags(null)).toBe(false);
  });

  it('has no GVCN for a class without teachers', () => {
    expect(pickPrimaryGroupTeacher([])).toBeNull();
  });

  it('picks the earliest-assigned teacher, then the lowest id', () => {
    expect(
      pickPrimaryGroupTeacher([
        { createdAt: '2026-09-02T00:00:00Z', userId: 'a' },
        { createdAt: '2026-09-01T00:00:00Z', userId: 'b' },
        { createdAt: null, userId: '0' },
      ])
    ).toBe('b');
    expect(
      pickPrimaryGroupTeacher([
        { createdAt: null, userId: 'z' },
        { createdAt: null, userId: 'c' },
      ])
    ).toBe('c');
  });
});
