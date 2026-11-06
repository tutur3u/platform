import { describe, expect, it } from 'vitest';
import {
  computeTopicAnnouncementSendDueAt,
  getTopicAnnouncementDeliveryState,
  zonedWallClockToUtcMs,
} from './topic-announcement-deadline';

describe('computeTopicAnnouncementSendDueAt', () => {
  it('subtracts 24 hours from the session start in the workspace timezone', () => {
    expect(
      computeTopicAnnouncementSendDueAt({
        sessionDate: '2026-11-05',
        startTime: '18:30',
        timeZone: 'Asia/Ho_Chi_Minh',
      })
    ).toBe('2026-11-04T11:30:00.000Z');
  });

  it('accepts database time values with seconds', () => {
    expect(
      computeTopicAnnouncementSendDueAt({
        sessionDate: '2026-11-05',
        startTime: '08:00:00',
        timeZone: 'UTC',
      })
    ).toBe('2026-11-04T08:00:00.000Z');
  });

  it('uses the offset in effect on the session date across DST changes', () => {
    // New York is UTC-4 before 2026-11-01 and UTC-5 after it.
    expect(
      computeTopicAnnouncementSendDueAt({
        sessionDate: '2026-11-02',
        startTime: '09:00',
        timeZone: 'America/New_York',
      })
    ).toBe('2026-11-01T14:00:00.000Z');
  });

  it.each([
    { sessionDate: null, startTime: '09:00', timeZone: 'UTC' },
    { sessionDate: '2026-11-02', startTime: null, timeZone: 'UTC' },
    { sessionDate: '2026-11-02', startTime: '09:00', timeZone: null },
    { sessionDate: '2026-11-02', startTime: '09:00', timeZone: 'auto' },
    { sessionDate: '2026-11-02', startTime: '09:00', timeZone: 'Not/AZone' },
    { sessionDate: '2026-02-30', startTime: '09:00', timeZone: 'UTC' },
    { sessionDate: '2026-11-02', startTime: '24:00', timeZone: 'UTC' },
  ])('returns null for incomplete or invalid input %#', (input) => {
    expect(computeTopicAnnouncementSendDueAt(input)).toBeNull();
  });
});

describe('zonedWallClockToUtcMs', () => {
  it('resolves a wall-clock time skipped by a DST jump after the jump', () => {
    const result = zonedWallClockToUtcMs({
      date: '2026-03-08',
      time: '02:30',
      timeZone: 'America/New_York',
    });
    expect(new Date(result ?? 0).toISOString()).toBe(
      '2026-03-08T07:30:00.000Z'
    );
  });
});

describe('getTopicAnnouncementDeliveryState', () => {
  const now = new Date('2026-11-04T12:00:00.000Z');

  it('is sent whenever sent_at exists, even after the deadline', () => {
    expect(
      getTopicAnnouncementDeliveryState({
        now,
        sendDueAt: '2026-11-01T00:00:00.000Z',
        sentAt: '2026-11-03T00:00:00.000Z',
      })
    ).toBe('sent');
  });

  it('is late when unsent past the deadline', () => {
    expect(
      getTopicAnnouncementDeliveryState({
        now,
        sendDueAt: '2026-11-04T11:59:59.000Z',
        sentAt: null,
      })
    ).toBe('late');
  });

  it('is not sent before the deadline or without one', () => {
    expect(
      getTopicAnnouncementDeliveryState({
        now,
        sendDueAt: '2026-11-04T12:00:00.000Z',
        sentAt: null,
      })
    ).toBe('not_sent');
    expect(
      getTopicAnnouncementDeliveryState({ now, sendDueAt: null, sentAt: null })
    ).toBe('not_sent');
  });
});
