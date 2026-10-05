import type { CalendarRecurrenceRule } from '@tuturuuu/types/primitives/calendar-recurrence';
import { describe, expect, it } from 'vitest';
import {
  calendarAnchorAtSlot,
  calendarProviderDateTimeLocal,
  calendarRecurrenceSlotInstant,
  inspectCalendarRecurrenceSlot,
} from '../calendar-recurrence-edit';

const anchor = {
  startLocal: '2026-03-07T02:30:00',
  endLocal: '2026-03-07T03:30:00',
  allDay: false,
};
const rule: CalendarRecurrenceRule = {
  version: 1,
  frequency: 'daily',
  interval: 1,
  timeZone: 'America/New_York',
  end: { type: 'count', count: 4 },
};
describe('recurrence edit identity and future split', () => {
  it('does not consume nonexistent DST slots when splitting count', () => {
    const result = inspectCalendarRecurrenceSlot({
      rule,
      anchor,
      originalStartLocal: '2026-03-10T02:30:00',
    });
    expect(result.precedingCount).toBe(2);
    expect(result.remainingRule.end).toEqual({ type: 'count', count: 2 });
    expect(result.previousRule?.end).toEqual({
      type: 'until',
      date: '2026-03-09',
    });
  });
  it.each([
    '2026-03-08T02:30:00',
    '2026-03-07T03:30:00',
    '2026-03-06T02:30:00',
    '2026-03-12T02:30:00',
  ])('rejects nonexistent or exhausted slot %s', (originalStartLocal) => {
    expect(() =>
      inspectCalendarRecurrenceSlot({ rule, anchor, originalStartLocal })
    ).toThrow('Not a series occurrence');
  });
  it('maps first-slot future edit to whole-series edit', () => {
    expect(
      inspectCalendarRecurrenceSlot({
        rule,
        anchor,
        originalStartLocal: anchor.startLocal,
      }).previousRule
    ).toBeNull();
  });
  it('rejects calendar-day boundaries after inclusive until', () => {
    expect(() =>
      inspectCalendarRecurrenceSlot({
        rule: { ...rule, end: { type: 'until', date: '2026-03-09' } },
        anchor,
        originalStartLocal: '2026-03-10T02:30:00',
      })
    ).toThrow();
  });
  it('preserves multi-day local duration at future boundary', () => {
    expect(
      calendarAnchorAtSlot(
        { ...anchor, endLocal: '2026-03-09T03:30:00' },
        '2026-03-15T02:30:00'
      ).endLocal
    ).toBe('2026-03-17T03:30:00');
  });
  it('does not admit intervening dates on weekly interval', () => {
    expect(() =>
      inspectCalendarRecurrenceSlot({
        rule: { ...rule, frequency: 'weekly', interval: 2, weekdays: ['SA'] },
        anchor,
        originalStartLocal: '2026-03-14T02:30:00',
      })
    ).toThrow();
  });
});

describe('provider occurrence timezone identity', () => {
  it('keeps the immutable slot instant after daylight saving changes', () => {
    expect(
      calendarRecurrenceSlotInstant({
        rule,
        anchor,
        originalStartLocal: '2026-03-09T02:30:00',
      })
    ).toBe('2026-03-09T06:30:00Z');
  });
  it('rejects a nonexistent original slot instead of shifting its identity', () => {
    expect(() =>
      calendarRecurrenceSlotInstant({
        rule,
        anchor,
        originalStartLocal: '2026-03-08T02:30:00',
      })
    ).toThrow();
  });
  it.each([
    { dateTime: '2026-03-09T06:30:00Z' },
    { dateTime: '2026-03-09T02:30:00-04:00' },
    { dateTime: '2026-03-09T06:30:00.0000000', timeZone: 'UTC' },
  ])('normalizes provider time without machine timezone: %j', (input) => {
    expect(calendarProviderDateTimeLocal(input, 'America/New_York')).toBe(
      '2026-03-09T02:30:00'
    );
  });
  it('rejects unsupported timezone names', () => {
    expect(() =>
      calendarProviderDateTimeLocal(
        { dateTime: '2026-03-09T09:00:00', timeZone: 'not-a-zone' },
        'UTC'
      )
    ).toThrow();
  });
});
