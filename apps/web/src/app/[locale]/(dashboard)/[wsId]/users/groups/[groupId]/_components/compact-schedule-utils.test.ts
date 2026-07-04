import type {
  WorkspaceUserGroupMissingSessionOccurrence,
  WorkspaceUserGroupSession,
} from '@tuturuuu/internal-api';
import { describe, expect, it } from 'vitest';
import {
  buildMoveSessionPayload,
  compactDraftForDate,
  compactScheduleBuckets,
  compactScheduleMonthDays,
  compactSessionTimeLabel,
} from './compact-schedule-utils';

function session(
  id: string,
  startsAt: string,
  endsAt: string
): WorkspaceUserGroupSession {
  return {
    description: null,
    descriptionJson: null,
    endTimezone: 'Asia/Ho_Chi_Minh',
    endsAt,
    files: [],
    groupId: 'group-1',
    groupName: 'Math A1',
    id,
    recurrenceInstanceDate: null,
    seriesId: null,
    source: 'admin',
    startTimezone: 'Asia/Ho_Chi_Minh',
    startsAt,
    status: 'scheduled',
    tags: [],
    title: 'Math A1',
  };
}

function missing(
  date: string,
  startsAt: string,
  endsAt: string
): WorkspaceUserGroupMissingSessionOccurrence {
  return {
    date,
    description: null,
    descriptionJson: null,
    endTimezone: 'Asia/Ho_Chi_Minh',
    endsAt,
    groupId: 'group-1',
    groupName: 'Math A1',
    seriesId: 'series-1',
    startTimezone: 'Asia/Ho_Chi_Minh',
    startsAt,
    title: 'Math A1',
  };
}

describe('compact schedule utilities', () => {
  it('builds a 42-day Monday-first month grid', () => {
    const days = compactScheduleMonthDays('2026-06');

    expect(days).toHaveLength(42);
    expect(days[0]?.key).toBe('2026-06-01');
    expect(days[41]?.key).toBe('2026-07-12');
  });

  it('groups sessions and missing occurrences by local date', () => {
    const buckets = compactScheduleBuckets(
      [
        session('late', '2026-06-10T13:00:00.000Z', '2026-06-10T14:00:00.000Z'),
        session(
          'early',
          '2026-06-10T00:00:00.000Z',
          '2026-06-10T01:00:00.000Z'
        ),
      ],
      [
        missing(
          '2026-06-12',
          '2026-06-12T00:00:00.000Z',
          '2026-06-12T01:00:00.000Z'
        ),
      ]
    );

    expect(buckets.get('2026-06-10')?.sessions.map((item) => item.id)).toEqual([
      'early',
      'late',
    ]);
    expect(buckets.get('2026-06-12')?.missing).toHaveLength(1);
  });

  it('preserves local start time and duration when moving a session', () => {
    const payload = buildMoveSessionPayload(
      session(
        'session-1',
        '2026-06-10T12:00:00.000Z',
        '2026-06-10T13:30:00.000Z'
      ),
      '2026-06-17'
    );

    expect(payload.startsAt).toBe('2026-06-17T12:00:00.000Z');
    expect(payload.endsAt).toBe('2026-06-17T13:30:00.000Z');
  });

  it('creates quick-add drafts at 7:00-8:30 PM GMT+7', () => {
    const draft = compactDraftForDate('2026-06-17');

    expect(draft.startsAt).toBe('2026-06-17T12:00:00.000Z');
    expect(draft.endsAt).toBe('2026-06-17T13:30:00.000Z');
  });

  it('formats compact local time labels', () => {
    expect(
      compactSessionTimeLabel(
        session(
          'session-1',
          '2026-06-10T12:00:00.000Z',
          '2026-06-10T13:30:00.000Z'
        )
      )
    ).toBe('19:00-20:30');
  });
});
