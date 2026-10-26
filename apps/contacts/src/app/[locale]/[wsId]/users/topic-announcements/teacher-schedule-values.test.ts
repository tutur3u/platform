import { describe, expect, it } from 'vitest';
import {
  addMinutesToTime,
  isIsoDate,
  normalizeScheduleDate,
  normalizeScheduleTime,
} from './teacher-schedule-values';

describe('normalizeScheduleTime', () => {
  it.each([
    ['5:30', 'PM', '17:30'],
    ['5:30', 'pm', '17:30'],
    ['12:00', 'PM', '12:00'],
    ['12:15', 'AM', '00:15'],
    ['9', 'AM', '09:00'],
    ['5.30', 'PM', '17:30'],
    ['5h30', 'PM', '17:30'],
    ['5:30 PM', '', '17:30'],
    ['5:30 p.m.', '', '17:30'],
    ['17:30', '', '17:30'],
    ['17:30', 'PM', '17:30'],
    ['17:30:00', '', '17:30'],
    ['5:30', 'Chiều', '17:30'],
    ['8:00', 'Sáng', '08:00'],
  ])('joins %s + %s into %s', (time, meridiem, expected) => {
    expect(normalizeScheduleTime(time, meridiem)).toBe(expected);
  });

  it.each([
    [0.75, '', '18:00'],
    [0.229_166_666_7, 'PM', '17:30'],
    [5.3, 'PM', '17:30'],
    [17, '', '17:00'],
  ])('reads numeric cell %s + %s as %s', (time, meridiem, expected) => {
    expect(normalizeScheduleTime(time, meridiem)).toBe(expected);
  });

  it.each([
    ['13:30', 'AM'],
    ['0:30', 'PM'],
    ['24:00', ''],
    ['5:75', ''],
    ['5:30 PM', 'AM'],
    ['5:30', 'noon'],
    ['soon', ''],
    ['', ''],
  ])('rejects %s + %s', (time, meridiem) => {
    expect(normalizeScheduleTime(time, meridiem)).toBeNull();
  });
});

describe('normalizeScheduleDate', () => {
  it.each([
    ['2026-10-05', undefined, '2026-10-05'],
    ['5/10/2026', undefined, '2026-10-05'],
    ['05-10-26', undefined, '2026-10-05'],
    ['5.10', 2026, '2026-10-05'],
    ['Mon 5/10', 2026, '2026-10-05'],
    [46_300, undefined, '2026-10-05'],
  ])('reads %s (year %s) as %s', (value, year, expected) => {
    expect(normalizeScheduleDate(value, year)).toBe(expected);
  });

  it.each([['31/2/2026'], ['5/10'], ['13/13/2026'], ['soon'], [0], ['']])(
    'rejects %s',
    (value) => {
      expect(normalizeScheduleDate(value)).toBeNull();
    }
  );

  it('recognizes only canonical ISO dates', () => {
    expect(isIsoDate('2026-10-05')).toBe(true);
    expect(isIsoDate('2026-1-5')).toBe(false);
    expect(isIsoDate('5/10/2026')).toBe(false);
    expect(isIsoDate(undefined)).toBe(false);
  });
});

describe('addMinutesToTime', () => {
  it('adds the session duration', () => {
    expect(addMinutesToTime('17:30', 30)).toBe('18:00');
    expect(addMinutesToTime('09:50', 90)).toBe('11:20');
  });

  it('returns null past midnight or for bad input', () => {
    expect(addMinutesToTime('23:45', 30)).toBeNull();
    expect(addMinutesToTime('5:30', 30)).toBeNull();
    expect(addMinutesToTime('17:30', 0)).toBeNull();
  });
});
