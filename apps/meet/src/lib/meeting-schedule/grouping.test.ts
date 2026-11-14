import { describe, expect, it } from 'vitest';
import {
  calendarRowSchema,
  dedupeCalendarEvents,
  groupMeetings,
  meetingRowSchema,
  utcInstant,
  viewerTimezone,
} from './grouping';

const now = '2026-11-13T12:00:00.000Z';
const meeting = (id: string, time: string) =>
  meetingRowSchema.parse({
    id,
    name: 'Fixture meeting',
    time,
    created_at: '2026-11-01T00:00:00Z',
    creator_id: 'fixture-account',
  });
const event = (id: string, createdAt: string, meetingId = 'future') =>
  calendarRowSchema.parse({
    id,
    created_at: createdAt,
    start_at: '2026-11-14T09:00:00+07:00',
    end_at: '2026-11-14T10:00:00+07:00',
    scheduling_metadata: { type: 'tuturuuu_meeting', meeting_id: meetingId },
  });

describe('UTC boundary', () => {
  it('normalizes explicit offsets without guessing a zone', () => {
    expect(utcInstant('2026-11-13T19:00:00+07:00')).toBe(now);
    expect(utcInstant('2026-11-13T12:00:00')).toBeNull();
    expect(utcInstant('not-a-date')).toBeNull();
    expect(utcInstant('2026-02-30T12:00:00Z')).toBeNull();
  });

  it('distinguishes repeated DST wall-clock times by their offsets', () => {
    expect(utcInstant('2026-11-01T01:30:00-04:00')).toBe(
      '2026-11-01T05:30:00.000Z'
    );
    expect(utcInstant('2026-11-01T01:30:00-05:00')).toBe(
      '2026-11-01T06:30:00.000Z'
    );
  });

  it('uses a valid profile zone, deferring missing/invalid zones to the browser', () => {
    expect(viewerTimezone('Asia/Ho_Chi_Minh').source).toBe('user-profile');
    expect(viewerTimezone('UTC')).toEqual({
      source: 'user-profile',
      timeZone: 'UTC',
    });
    for (const zone of [null, undefined, '', 'invalid/zone', 7]) {
      expect(viewerTimezone(zone)).toEqual({
        source: 'browser',
        timeZone: null,
      });
    }
  });
});

describe('Calendar deduplication', () => {
  const oldest = event('a', '2026-11-01T00:00:00Z');
  const tied = event('b', '2026-11-01T00:00:00Z');
  const later = event('c', '2026-11-02T00:00:00Z');

  it('chooses oldest creation then id, regardless of input order', () => {
    const permutations = [
      [oldest, tied, later],
      [oldest, later, tied],
      [tied, oldest, later],
      [tied, later, oldest],
      [later, oldest, tied],
      [later, tied, oldest],
    ];
    for (const rows of permutations) {
      const map = dedupeCalendarEvents([...rows, oldest]);
      expect(map.size).toBe(1);
      expect(map.get('future')).toEqual({
        id: 'a',
        startAt: '2026-11-14T02:00:00.000Z',
        endAt: '2026-11-14T03:00:00.000Z',
      });
    }
  });

  it('keeps different meetings separate and rejects unrelated metadata', () => {
    expect(
      dedupeCalendarEvents([oldest, event('other', now, 'other')]).size
    ).toBe(2);
    expect(
      calendarRowSchema.safeParse({
        ...oldest,
        scheduling_metadata: { type: 'other', meeting_id: 'future' },
      }).success
    ).toBe(false);
  });
});

describe('section rules', () => {
  it('classifies independently of Calendar access and orders each section', () => {
    const rows = [
      meeting('future', '2026-11-14T00:00:00Z'),
      meeting('older', '2026-11-11T00:00:00Z'),
      meeting('equal', now),
      meeting('next', '2026-11-13T12:00:01Z'),
      meeting('past', '2026-11-12T00:00:00Z'),
    ];
    const hidden = groupMeetings(rows, new Map(), now);
    const visible = groupMeetings(
      rows,
      dedupeCalendarEvents([event('a', now)]),
      now
    );
    expect(hidden.upcoming.map((row) => row.id)).toEqual(['next', 'future']);
    expect(hidden.past.map((row) => row.id)).toEqual([
      'equal',
      'past',
      'older',
    ]);
    expect(visible.upcoming.map((row) => row.id)).toEqual(['next', 'future']);
    expect(hidden.upcoming.every((row) => row.calendar === null)).toBe(true);
    expect(visible.upcoming[1]?.calendar?.id).toBe('a');
    expect(rows.map((row) => row.id)).toEqual([
      'future',
      'older',
      'equal',
      'next',
      'past',
    ]);
  });

  it('keeps ambiguous legacy time in Past and deduplicates meeting ids', () => {
    const row = meeting('legacy', '2026-11-15T12:00:00');
    const result = groupMeetings([row, row], new Map(), now);
    expect(result.upcoming).toEqual([]);
    expect(result.past).toHaveLength(1);
    expect(result.past[0]?.time).toBeNull();
  });

  it('handles empty sections and rejects an ambiguous evaluation time', () => {
    expect(groupMeetings([], new Map(), now)).toEqual({
      upcoming: [],
      past: [],
    });
    expect(() => groupMeetings([], new Map(), '2026-11-13T12:00:00')).toThrow();
  });

  it('uses stable id ordering for equal meeting times', () => {
    const a = meeting('a', now);
    const b = meeting('b', now);
    expect(
      groupMeetings([b, a], new Map(), now).past.map((row) => row.id)
    ).toEqual(['a', 'b']);
  });
});
